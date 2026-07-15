"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/roles";

export type AccessState = { error?: string; ok?: boolean };

/** Owner/admin save of the employee-access config for the active company. */
export async function updateEmployeeAccess(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (!isAdminRole(active.role)) {
    return { error: "Not allowed." };
  }

  const row = {
    company_id: active.id,
    attendance: formData.get("attendance") === "on",
    leave: formData.get("leave") === "on",
    claims: formData.get("claims") === "on",
    salary: formData.get("salary") === "on",
    dash_pay: formData.get("dash_pay") === "on",
    dash_leave: formData.get("dash_leave") === "on",
    dash_attendance: formData.get("dash_attendance") === "on",
    nav_style: formData.get("nav_style") === "pillars" ? "pillars" : "flat",
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient();
  const { error } = await supabase
    .from("company_employee_access")
    .upsert(row, { onConflict: "company_id" });

  if (error) return { error: error.message };

  revalidatePath("/access");
  revalidatePath("/", "layout"); // refresh the employee nav for affected sessions
  return { ok: true };
}
