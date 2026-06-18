import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Employee top-nav layout: a flat list of their pages, or the pillar groups. */
export type NavStyle = "flat" | "pillars";

/** What an `employee`-role member is allowed to see/open, configured per company. */
export type EmployeeAccess = {
  // Page/surface access (also gates the matching nav item).
  attendance: boolean;
  leave: boolean;
  claims: boolean;
  salary: boolean;
  // Dashboard widget switches. Each also requires its master flag above
  // (e.g. the pay charts need `salary` AND `dashPay`).
  dashPay: boolean;
  dashLeave: boolean;
  dashAttendance: boolean;
  // Employee top-nav layout.
  navStyle: NavStyle;
};

/** All-on: preserves today's behavior when no settings row exists yet. */
export const DEFAULT_EMPLOYEE_ACCESS: EmployeeAccess = {
  attendance: true,
  leave: true,
  claims: true,
  salary: true,
  dashPay: true,
  dashLeave: true,
  dashAttendance: true,
  navStyle: "flat",
};

/** Employee-gated nav keys → the access flag that controls them. */
export const ACCESS_NAV_FLAGS: Record<string, keyof EmployeeAccess> = {
  attendance: "attendance",
  leave: "leave",
  claims: "claims",
};

/** The active company's employee-access config, defaulting to all-on. */
export async function getEmployeeAccess(companyId: string): Promise<EmployeeAccess> {
  const supabase = createClient();
  const { data } = await supabase
    .from("company_employee_access")
    .select("attendance, leave, claims, salary, dash_pay, dash_leave, dash_attendance, nav_style")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return DEFAULT_EMPLOYEE_ACCESS;
  return {
    attendance: data.attendance ?? true,
    leave: data.leave ?? true,
    claims: data.claims ?? true,
    salary: data.salary ?? true,
    dashPay: data.dash_pay ?? true,
    dashLeave: data.dash_leave ?? true,
    dashAttendance: data.dash_attendance ?? true,
    navStyle: data.nav_style === "pillars" ? "pillars" : "flat",
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
