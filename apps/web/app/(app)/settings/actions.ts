"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string };

export type NotificationsState = { error?: string; ok?: boolean };

// Lenient ID phone validation: digits only after stripping formatting; 8–15 digits.
// Empty is allowed (clears the number / leaves WhatsApp off).
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ""))
  .refine((v) => v === "" || /^\+?\d{8,15}$/.test(v), {
    message: "Nomor telepon tidak valid.",
  });

/**
 * Save the user's notification preferences: WhatsApp phone number + opt-in.
 * `profiles.phone` is a real column; `whatsapp_opt_in` is pending — see
 * `docs/handoff/whatsapp-notifications.md`.
 */
export async function updateNotifications(
  _prev: NotificationsState,
  formData: FormData,
): Promise<NotificationsState> {
  const optIn = formData.get("whatsappOptIn") === "on";
  const parsed = phoneSchema.safeParse(formData.get("phone") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const phone = parsed.data;
  if (optIn && !phone) {
    return { error: "Masukkan nomor WhatsApp untuk mengaktifkan notifikasi WhatsApp." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // TODO(db): need column profiles.whatsapp_opt_in (boolean, default false) + self-update
  // RLS for phone/whatsapp_opt_in — Antigravity (docs/handoff/whatsapp-notifications.md).
  // Quarantine cast until the column lands in packages/types.
  const update = {
    phone: phone || null,
    whatsapp_opt_in: optIn,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("profiles")
    .update(update as never)
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Deactivate the current user's account (reversible). Flags the account
 * deactivated, then signs out and lands on sign-in with a notice. Reactivation is
 * handled out of band (support / re-enable) by design — there is no self-serve
 * hard delete.
 */
export async function deactivateAccount(): Promise<SettingsState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { error } = await supabase.rpc("deactivate_current_user");

  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect("/sign-in?deactivated=1");
}
