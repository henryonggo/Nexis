import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** What an `employee`-role member is allowed to see/open, configured per company. */
export type EmployeeAccess = {
  attendance: boolean;
  leave: boolean;
  claims: boolean;
  salary: boolean;
};

/** All-on: preserves today's behavior when no settings row exists yet. */
export const DEFAULT_EMPLOYEE_ACCESS: EmployeeAccess = {
  attendance: true,
  leave: true,
  claims: true,
  salary: true,
};

/** Employee-gated nav keys → the access flag that controls them. */
export const ACCESS_NAV_FLAGS: Record<string, keyof EmployeeAccess> = {
  attendance: "attendance",
  leave: "leave",
  claims: "claims",
};

// TODO(db): table company_employee_access(
//   company_id uuid primary key references companies(id) on delete cascade,
//   attendance boolean not null default true,
//   leave      boolean not null default true,
//   claims     boolean not null default true,
//   salary     boolean not null default true,
//   updated_at timestamptz not null default now())
// RLS: every company member may SELECT their company's row; only owner/admin may
// INSERT/UPDATE. Until this lands, the select below errors (relation missing) → we
// fall back to DEFAULT_EMPLOYEE_ACCESS (all-on). Once generated types exist, drop the
// cast and read the typed row. — Antigravity
type AccessClient = { from: (table: string) => any };

/** The active company's employee-access config, defaulting to all-on. */
export async function getEmployeeAccess(companyId: string): Promise<EmployeeAccess> {
  const supabase = createClient();
  const { data } = await (supabase as unknown as AccessClient)
    .from("company_employee_access")
    .select("attendance, leave, claims, salary")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return DEFAULT_EMPLOYEE_ACCESS;
  return {
    attendance: data.attendance ?? true,
    leave: data.leave ?? true,
    claims: data.claims ?? true,
    salary: data.salary ?? true,
  };
}

/**
 * Server-side route block: for the `employee` role only, redirect to the dashboard
 * when the requested surface is turned off. Owner/admin/manager are unaffected.
 */
export async function guardEmployeeAccess(
  role: string,
  companyId: string,
  flag: keyof EmployeeAccess,
): Promise<void> {
  if (role !== "employee") return;
  const access = await getEmployeeAccess(companyId);
  if (!access[flag]) redirect("/dashboard");
}
