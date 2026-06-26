import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { sum, type Rupiah } from "@nexis/money";

/**
 * Manual (ad-hoc) deductions — one-off amounts an admin/owner subtracts from a
 * specific employee's pay, each with a mandatory **reason**. The primary use is an
 * absence: when someone was expected to work (per their weekly schedule) but has
 * no attendance that day, the admin records a deduction and why.
 *
 * Unlike the reusable `custom_deduction_types`, these are per-employee, per-event
 * rows: an amount, a reason, and the date it applies to. The payroll run subtracts
 * the entries whose date falls in the run period.
 */

export interface ManualDeduction {
  id: string;
  employeeId: string;
  amount: Rupiah;
  reason: string;
  /** YYYY-MM-DD the deduction applies to (e.g. the missed workday), or null. */
  date: string | null;
  createdAt: string | null;
}

function toRow(r: any): ManualDeduction {
  return {
    id: r.id,
    employeeId: r.employee_id,
    amount: r.amount ?? 0,
    reason: r.reason ?? "",
    date: r.date ?? null,
    createdAt: r.created_at ?? null,
  };
}

/** All manual deductions for one employee, newest first. */
export async function listManualDeductions(
  supabase: SupabaseClient<Database>,
  companyId: string,
  employeeId: string,
): Promise<ManualDeduction[]> {
  const { data } = await supabase
    .from("employee_manual_deduction")
    .select("id, employee_id, amount, reason, date, created_at")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return ((data as any[] | null) ?? []).map(toRow);
}

/** Company-wide manual deductions grouped by employee, for the run preview. */
export async function loadBulkManualDeductions(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<Map<string, ManualDeduction[]>> {
  const { data } = await supabase
    .from("employee_manual_deduction")
    .select("id, employee_id, amount, reason, date, created_at")
    .eq("company_id", companyId);

  const byEmployee = new Map<string, ManualDeduction[]>();
  for (const r of (data as any[] | null) ?? []) {
    const row = toRow(r);
    const bucket = byEmployee.get(row.employeeId) ?? [];
    bucket.push(row);
    byEmployee.set(row.employeeId, bucket);
  }
  return byEmployee;
}

/**
 * Total of an employee's manual deductions that fall within a run period. Only
 * dated entries are attributed to a period (a null date is an undated note that a
 * run shouldn't auto-apply); `start`/`end` are inclusive YYYY-MM-DD bounds.
 */
export function sumManualDeductionsForPeriod(
  rows: ManualDeduction[] | undefined,
  start: string,
  end: string,
): Rupiah {
  if (!rows || rows.length === 0) return 0;
  return sum(
    ...rows.filter((r) => r.date != null && r.date >= start && r.date <= end).map((r) => r.amount),
  );
}
