"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { normalizeWorkDays } from "@/lib/work-schedule";

export type SettingsState = { error?: string };

export type PayrollSettingsState = { error?: string; ok?: boolean };

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

/** Save the user's notification preferences: WhatsApp phone number + opt-in. */
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

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: phone || null,
      whatsapp_opt_in: optIn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

const payrollSettingsSchema = z.object({
  // Days in the workweek (5 or 6) — drives the Saturday rest-day overtime rule.
  workweekDays: z.coerce.number().int().min(5).max(7).default(5),
});

/**
 * Save company-level payroll/working-days settings: the workweek length (for
 * overtime) and the default weekly work schedule (which weekdays staff are
 * expected to work), which scales daily/mixed pay and defines absences. Owner/
 * admin only. `company_settings.work_days` is an `int[]` of ISO weekdays
 * (1=Mon…7=Sun).
 */
export async function updatePayrollSettings(
  _prev: PayrollSettingsState,
  formData: FormData,
): Promise<PayrollSettingsState> {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengubah pengaturan payroll." };
  }

  const parsed = payrollSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const workDays = normalizeWorkDays(formData.getAll("workDays").map((v) => Number(v)));

  const supabase = createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({
      workweek_days: parsed.data.workweekDays,
      work_days: workDays,
    })
    .eq("company_id", active.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/payroll", "layout");
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
