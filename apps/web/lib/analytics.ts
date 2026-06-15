import "server-only";
import type { Database } from "@nexis/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPeriod } from "./payroll-format";

type EmploymentType = Database["public"]["Enums"]["employment_type"];

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: "Tetap",
  contract: "Kontrak",
  intern: "Magang",
  daily: "Harian",
};

export interface NamedCount {
  label: string;
  value: number;
}

export interface HeadcountStats {
  /** Active = status active or probation (matches the seat-limit semantics). */
  active: number;
  total: number;
  byDepartment: NamedCount[];
  byEmploymentType: NamedCount[];
}

/**
 * Headcount rollups. We fetch the lightweight employee rows for the company and
 * aggregate in JS (no GROUP BY RPC needed — that would be Antigravity's lane).
 */
export async function getHeadcountStats(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<HeadcountStats> {
  const { data } = await supabase
    .from("employees")
    .select("status, department, employment_type")
    .eq("company_id", companyId);

  type Row = Pick<
    Database["public"]["Tables"]["employees"]["Row"],
    "status" | "department" | "employment_type"
  >;
  const rows = (data as Row[] | null) ?? [];

  const active = rows.filter((r) => r.status === "active" || r.status === "probation");

  const deptMap = new Map<string, number>();
  const typeMap = new Map<EmploymentType, number>();
  for (const r of active) {
    const dept = r.department?.trim() || "Tanpa departemen";
    deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
    typeMap.set(r.employment_type, (typeMap.get(r.employment_type) ?? 0) + 1);
  }

  const byDepartment = Array.from(deptMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const byEmploymentType = Array.from(typeMap.entries())
    .map(([type, value]) => ({ label: EMPLOYMENT_TYPE_LABELS[type] ?? type, value }))
    .sort((a, b) => b.value - a.value);

  return { active: active.length, total: rows.length, byDepartment, byEmploymentType };
}

export interface PayrollPeriodPoint {
  periodLabel: string;
  gross: number;
  net: number;
  bpjsEmployer: number;
  pph21: number;
}

/**
 * The most recent finalized (completed/paid) payroll runs, oldest→newest, for the
 * cost trend chart. Capped to `limit` periods.
 */
export async function getPayrollTrend(
  supabase: SupabaseClient<Database>,
  companyId: string,
  limit = 12,
): Promise<PayrollPeriodPoint[]> {
  const { data } = await supabase
    .from("payroll_runs")
    .select(
      "period_year, period_month, total_gross, total_net, total_bpjs_employer, total_pph21",
    )
    .eq("company_id", companyId)
    .in("status", ["completed", "paid"])
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(limit);

  type Row = Pick<
    Database["public"]["Tables"]["payroll_runs"]["Row"],
    "period_year" | "period_month" | "total_gross" | "total_net" | "total_bpjs_employer" | "total_pph21"
  >;
  const rows = (data as Row[] | null) ?? [];

  // Newest-first from the query → reverse to chronological for the chart.
  return rows
    .map((r) => ({
      periodLabel: formatPeriod(r.period_year, r.period_month),
      gross: r.total_gross ?? 0,
      net: r.total_net ?? 0,
      bpjsEmployer: r.total_bpjs_employer ?? 0,
      pph21: r.total_pph21 ?? 0,
    }))
    .reverse();
}

/**
 * Approved overtime hours per month over the last `months` periods (chronological,
 * zero-filled). Reads approved `overtime_entries` and sums `duration_minutes` → hours.
 */
export async function getOvertimeTrend(
  supabase: SupabaseClient<Database>,
  companyId: string,
  months: number,
): Promise<NamedCount[]> {
  const now = new Date();
  const startY = now.getUTCFullYear();
  const startM = now.getUTCMonth() - (months - 1); // may be negative → Date normalizes
  const start = new Date(Date.UTC(startY, startM, 1));
  const cutoff = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data } = await supabase
    .from("overtime_entries")
    .select("date, duration_minutes")
    .eq("company_id", companyId)
    .eq("is_approved", true)
    .gte("date", cutoff);

  type Row = { date: string; duration_minutes: number };
  const rows = (data as Row[] | null) ?? [];

  // key = year*12 + (month-1) → minutes
  const minutesByKey = new Map<number, number>();
  for (const r of rows) {
    const d = new Date(r.date);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    minutesByKey.set(key, (minutesByKey.get(key) ?? 0) + (r.duration_minutes ?? 0));
  }

  const out: NamedCount[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startY, startM + i, 1));
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const hours = Math.round(((minutesByKey.get(key) ?? 0) / 60) * 10) / 10;
    out.push({ label: formatPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1), value: hours });
  }
  return out;
}

export interface EmployerCostBreakdown {
  periodLabel: string | null;
  total: number;
  byDepartment: NamedCount[];
}

/**
 * Total employer cost of the latest finalized run, split by department. Employer
 * cost = gross pay + all employer-side BPJS legs (Kes/JHT/JP/JKK/JKM). Joins
 * `payroll_items` to `employees.department`; aggregates in JS.
 */
export async function getEmployerCostByDept(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<EmployerCostBreakdown> {
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, period_year, period_month")
    .eq("company_id", companyId)
    .in("status", ["completed", "paid"])
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { periodLabel: null, total: 0, byDepartment: [] };

  const [{ data: items }, { data: employees }] = await Promise.all([
    supabase
      .from("payroll_items")
      .select(
        "employee_id, gross_pay, bpjs_kes_employer, jht_employer, jp_employer, jkk_employer, jkm_employer",
      )
      .eq("payroll_run_id", run.id),
    supabase.from("employees").select("id, department").eq("company_id", companyId),
  ]);

  const deptById = new Map(
    ((employees as { id: string; department: string | null }[] | null) ?? []).map((e) => [
      e.id,
      e.department?.trim() || "Tanpa departemen",
    ]),
  );

  type Item = {
    employee_id: string;
    gross_pay: number;
    bpjs_kes_employer: number;
    jht_employer: number;
    jp_employer: number;
    jkk_employer: number;
    jkm_employer: number;
  };
  const map = new Map<string, number>();
  let total = 0;
  for (const it of (items as Item[] | null) ?? []) {
    const cost =
      it.gross_pay +
      it.bpjs_kes_employer +
      it.jht_employer +
      it.jp_employer +
      it.jkk_employer +
      it.jkm_employer;
    total += cost;
    const dept = deptById.get(it.employee_id) ?? "Tanpa departemen";
    map.set(dept, (map.get(dept) ?? 0) + cost);
  }

  const byDepartment = Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return { periodLabel: formatPeriod(run.period_year, run.period_month), total, byDepartment };
}

export interface ApprovalStats {
  pendingLeave: number;
  pendingClaims: number;
}

/** Outstanding approval queue depth (leave + reimbursement), for the KPI strip. */
export async function getApprovalStats(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<ApprovalStats> {
  const [{ count: pendingLeave }, { count: pendingClaims }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
    supabase
      .from("reimbursement_claims")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
  ]);
  return { pendingLeave: pendingLeave ?? 0, pendingClaims: pendingClaims ?? 0 };
}

/**
 * Approved leave days grouped by leave type for the given calendar year. Joins the
 * leave type name; aggregates `days` in JS.
 */
export async function getLeaveUsage(
  supabase: SupabaseClient<Database>,
  companyId: string,
  year: number,
): Promise<NamedCount[]> {
  const { data } = await supabase
    .from("leave_requests")
    .select("days, start_date, status, leave_types(name)")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);

  type Row = { days: number; leave_types: { name: string } | null };
  const rows = (data as unknown as Row[] | null) ?? [];

  const map = new Map<string, number>();
  for (const r of rows) {
    const name = r.leave_types?.name ?? "Lainnya";
    map.set(name, (map.get(name) ?? 0) + (r.days ?? 0));
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
