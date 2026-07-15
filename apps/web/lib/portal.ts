import "server-only";

import type { ActiveCompany } from "@nexis/types";
import type { Rupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getMemberships } from "@/lib/company";
import { getCompanyLeaveRequests } from "@/lib/leave";
import { planMeta } from "@/lib/billing-plans";
import { isManagerRole } from "@/lib/roles";

/** Run statuses that mean a payroll run is mid-flight and wants admin attention. */
const ACTIONABLE_RUN_STATUSES = ["draft", "queued", "processing", "failed"];

type Role = ActiveCompany["role"];

/** A company that needs billing reads (seats) on the portal card. */
function canReadBilling(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "accountant";
}

/** A company whose approval queue (pending leave) the role can read. */
function canReadApprovals(role: Role): boolean {
  return isManagerRole(role);
}

/** One company's at-a-glance summary on the cross-company portal. */
export interface PortalCompanySummary {
  id: string;
  name: string;
  role: Role;
  plan: ActiveCompany["plan"];
  /** Active-employee headcount; null for the minimal (employee-role) card. */
  headcount: number | null;
  /** Active seats counted for billing; null when the role can't read billing. */
  activeSeats: number | null;
  /** Seat cap for the plan; null = unlimited/unknown. */
  seatLimit: number | null;
  lastPayroll: {
    periodYear: number;
    periodMonth: number;
    status: string;
    totalNet: Rupiah;
  } | null;
  /** Pending leave approvals; null when the role can't read approvals. */
  pendingApprovals: number | null;
  /** Something on this company wants the user's attention (pending / mid-flight run). */
  needsAction: boolean;
  /** A per-company read failed — render a degraded card, never 500 the page. */
  loadError: boolean;
  /** Minimal (employee-role) card: name/role/plan only, no aggregate reads. */
  minimal: boolean;
}

/** Consolidated totals across every company the user belongs to. */
export interface PortalRollup {
  totalCompanies: number;
  totalHeadcount: number;
  companiesNeedingAction: number;
  totalLastPayrollNet: Rupiah;
}

export interface PortalData {
  companies: PortalCompanySummary[];
  rollup: PortalRollup;
}

/** A degraded summary from membership data alone (used when a read fails). */
function degraded(m: ActiveCompany, loadError: boolean): PortalCompanySummary {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    plan: m.plan,
    headcount: null,
    activeSeats: null,
    seatLimit: null,
    lastPayroll: null,
    pendingApprovals: null,
    needsAction: false,
    loadError,
    minimal: m.role === "employee",
  };
}

/**
 * Load one company's portal summary. Reuses the dashboard's admin read shapes,
 * scoped to this company (RLS enforces the same company/role boundary). The
 * caller's role decides which reads run, so a manager card never tries a billing
 * read it can't see.
 */
async function loadCompanySummary(
  supabase: ReturnType<typeof createClient>,
  m: ActiveCompany,
): Promise<PortalCompanySummary> {
  // Employees get a minimal card — no company-wide aggregate is theirs to read.
  if (m.role === "employee") return degraded(m, false);

  const billing = canReadBilling(m.role);
  const approvals = canReadApprovals(m.role);

  const [{ data: statusRows }, billingRes, { data: runRows }, pending] = await Promise.all([
    supabase.from("employees").select("status").eq("company_id", m.id).eq("status", "active"),
    billing
      ? supabase
          .from("company_billing")
          .select("free_seat_limit, active_seats")
          .eq("company_id", m.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("payroll_runs")
      .select("period_year, period_month, status, total_net")
      .eq("company_id", m.id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(1),
    approvals
      ? getCompanyLeaveRequests(supabase, m.id).then(
          (rows) => rows.filter((r) => r.status === "pending").length,
        )
      : Promise.resolve(null),
  ]);

  const headcount = ((statusRows as { status: string }[] | null) ?? []).length;

  const billingRow = billingRes.data as
    | { free_seat_limit: number | null; active_seats: number | null }
    | null;
  const activeSeats = billingRow?.active_seats ?? null;
  // Seat cap is data-driven: free plans use the billing limit, paid plans the
  // plan's cap; null means unlimited/unknown.
  const seatLimit =
    m.plan === "free" ? billingRow?.free_seat_limit ?? null : planMeta(m.plan).seatCap;

  const run = ((runRows as
    | { period_year: number; period_month: number; status: string; total_net: number }[]
    | null) ?? [])[0];
  const lastPayroll = run
    ? {
        periodYear: run.period_year,
        periodMonth: run.period_month,
        status: run.status,
        totalNet: run.total_net,
      }
    : null;

  const pendingApprovals = approvals ? (pending as number) : null;
  const needsAction =
    (pendingApprovals ?? 0) > 0 ||
    (lastPayroll != null && ACTIONABLE_RUN_STATUSES.includes(lastPayroll.status));

  return {
    id: m.id,
    name: m.name,
    role: m.role,
    plan: m.plan,
    headcount,
    activeSeats: billing ? activeSeats : null,
    seatLimit: billing ? seatLimit : null,
    lastPayroll,
    pendingApprovals,
    needsAction,
    loadError: false,
    minimal: false,
  };
}

/**
 * Every company the signed-in user belongs to, each with an at-a-glance summary.
 * Fans out per-company reads concurrently; one company's failure degrades to a
 * loadError card instead of taking down the whole portal.
 */
export async function getPortalCompanies(): Promise<PortalData> {
  const memberships = await getMemberships();
  const supabase = createClient();

  const settled = await Promise.allSettled(
    memberships.map((m) => loadCompanySummary(supabase, m)),
  );

  const companies = settled.map((res, i) =>
    res.status === "fulfilled" ? res.value : degraded(memberships[i]!, true),
  );

  const rollup: PortalRollup = {
    totalCompanies: companies.length,
    totalHeadcount: companies.reduce((s, c) => s + (c.headcount ?? 0), 0),
    companiesNeedingAction: companies.filter((c) => c.needsAction).length,
    totalLastPayrollNet: companies.reduce((s, c) => s + (c.lastPayroll?.totalNet ?? 0), 0),
  };

  return { companies, rollup };
}
