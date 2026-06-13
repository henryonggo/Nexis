"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendVerificationEmail } from "@/lib/email";
import {
  signUpSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation";

export type ActionState = { error?: string; success?: string };

function siteUrl() {
  const h = headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return origin;
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const { email, password, fullName } = parsed.data;
  const redirectTo = formData.get("redirectTo") as string;

  // Verification link lands on the login page (or invite redirect) after confirming.
  const verifyRedirect = `${siteUrl()}/auth/callback?next=${encodeURIComponent(redirectTo || "/sign-in")}`;

  // App-managed confirmation: when configured, create the user + mint our own
  // confirmation link (generateLink does NOT send an email), then send a branded
  // email via Resend. Supabase's built-in "Confirm signup" email must be disabled
  // in the dashboard so users don't get two mails.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.RESEND_API_KEY) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: { full_name: fullName }, redirectTo: verifyRedirect },
    });
    if (error) return { error: error.message };

    const link = data.properties?.action_link;
    if (link) {
      await sendVerificationEmail({ to: email, verifyUrl: link, fullName });
    }
    return { success: "Account created. Check your email to verify your account." };
  }

  // Fallback for local dev without service-role / Resend: Supabase sends its default
  // confirmation email, still redirecting to the login page.
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: verifyRedirect },
  });

  if (error) return { error: error.message };
  return { success: "Account created. Check your email to verify your account." };
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "Email atau kata sandi salah." };
  }

  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";
  redirect(redirectTo);
}

export async function forgotPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email tidak valid" };
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });

  // Neutral response to avoid user enumeration.
  return { success: "Jika akun terdaftar, kami telah mengirim tautan reset ke email Anda." };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Kata sandi tidak valid" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  redirect("/sign-in?reset=1");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/** Sign out triggered by the inactivity timer; lands on sign-in with a notice. */
export async function signOutIdle() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/sign-in?timeout=1");
}
