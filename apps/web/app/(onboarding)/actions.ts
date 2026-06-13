"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCompanySchema } from "@/lib/validation";

export type OnboardingState = { error?: string };

export async function createFirstCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    industry: (formData.get("industry") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Atomic provisioning: creates the company, owner membership, settings, and
  // a FREE billing row (5 free seats, no NPWP required). See migration RPC.
  const { error } = await supabase.rpc("create_company_with_owner", {
    p_name: parsed.data.name,
    p_industry: parsed.data.industry,
  });

  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function joinCompanyWithCode(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const token = (formData.get("code") as string)?.trim();
  if (!token) {
    return { error: "Kode undangan harus diisi." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Call the accept_invitation RPC. It handles linking the user's auth email and employee record.
  const { data: companyId, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) {
    const MESSAGES: Record<string, string> = {
      INVITE_INVALID: "Undangan tidak ditemukan atau sudah dipakai.",
      INVITE_EXPIRED: "Undangan sudah kedaluwarsa.",
      INVITE_EMAIL_MISMATCH: "Undangan ini ditujukan untuk alamat email lain.",
    };
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: key ? MESSAGES[key]! : error.message };
  }

  // Set the joined company as the active one using cookie
  if (typeof companyId === "string") {
    const { cookies } = await import("next/headers");
    const { ACTIVE_COMPANY_COOKIE } = await import("@/lib/company");
    cookies().set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect("/dashboard");
}
