"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type AccessState = { error?: string; ok?: boolean };

/** Owner/admin save of the employee-access config for the active company. */
export async function updateEmployeeAccess(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Not allowed." };
  }

  const row = {
    company_id: active.id,
    attendance: formData.get("attendance") === "on",
    leave: formData.get("leave") === "on",
    claims: formData.get("claims") === "on",
    salary: formData.get("salary") === "on",
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient();
  const { error } = await supabase
    .from("company_employee_access")
    .upsert(row, { onConflict: "company_id" });

  if (error) return { error: error.message };

  // TODO(db): fold these into the row above once the columns exist — Antigravity.
  // dash_pay, dash_leave, dash_attendance (bool), nav_style (text). Written as a
  // separate best-effort upsert so a missing-column error pre-migration can't
  // fail the core save above; the catch is removed when types are regenerated.
  const extra = {
    company_id: active.id,
    dash_pay: formData.get("dash_pay") === "on",
    dash_leave: formData.get("dash_leave") === "on",
    dash_attendance: formData.get("dash_attendance") === "on",
    nav_style: formData.get("nav_style") === "pillars" ? "pillars" : "flat",
  };
  await supabase
    .from("company_employee_access")
    .upsert(extra as never, { onConflict: "company_id" });

  revalidatePath("/access");
  revalidatePath("/", "layout"); // refresh the employee nav for affected sessions
  return { ok: true };
}
