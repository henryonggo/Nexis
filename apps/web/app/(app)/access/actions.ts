"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type AccessState = { error?: string; ok?: boolean };

type AccessClient = { from: (table: string) => any };

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
  // TODO(db): upsert into company_employee_access (shape in lib/access.ts). Until the
  // table lands this returns a relation-missing error surfaced to the admin. — Antigravity
  const { error } = await (supabase as unknown as AccessClient)
    .from("company_employee_access")
    .upsert(row, { onConflict: "company_id" });

  if (error) return { error: error.message };

  revalidatePath("/access");
  revalidatePath("/", "layout"); // refresh the employee nav for affected sessions
  return { ok: true };
}
