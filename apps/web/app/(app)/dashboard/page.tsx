import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getCompanyLeaveRequests } from "@/lib/leave";
import { getEmployeeAccess } from "@/lib/access";
import { SetupChecklist } from "./setup-checklist";
import {
  StatCard,
  PayTrendChart,
  SalaryBreakdownCard,
  LeaveCard,
  AttendanceStrip,
  SegmentDonutCard,
  type PayPoint,
} from "./dashboard-widgets";
import { Wallet, CalendarDays, Clock } from "lucide-react";
import { formatPeriod, formatRupiah, MONTH_NAMES_ID } from "@/lib/payroll-format";
import { sumFixedAllowances } from "@/lib/payroll";
import { formatDateRange } from "@/lib/date";
import { planMeta } from "@/lib/billing-plans";
import type { CompanyBillingRow } from "@nexis/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Start of "today" in Asia/Jakarta (WIB, UTC+7, no DST), as a UTC ISO string. */
function startOfTodayJakartaIso(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startWibUtcMs = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate());
  return new Date(startWibUtcMs - WIB_OFFSET_MS).toISOString();
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** yyyy-mm-dd of a UTC instant in Asia/Jakarta (WIB). */
function jakartaDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC ISO for the start (Jakarta midnight) of `daysBack` days ago. */
function startOfDaysAgoJakartaIso(daysBack: number): string {
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startWibUtcMs = Date.UTC(
    nowWib.getUTCFullYear(),
    nowWib.getUTCMonth(),
    nowWib.getUTCDate() - daysBack,
  );
  return new Date(startWibUtcMs - WIB_OFFSET_MS).toISOString();
}

/** Count employees whose latest attendance event today marks them present. */
function countPresent(records: { employee_id: string; kind: string }[]): number {
  // records arrive newest-first, so the first row seen per employee is their latest event.
  const latestKind = new Map<string, string>();
  for (const r of records) {
    if (!latestKind.has(r.employee_id)) latestKind.set(r.employee_id, r.kind);
  }
  let present = 0;
  for (const kind of latestKind.values()) {
    if (kind === "clock_in" || kind === "break_end") present += 1;
  }
  return present;
}

/** Self-service overview for the `employee` role: their own salary, leave, and attendance. */
async function EmployeeDashboard({ companyId }: { companyId: string }) {
  const supabase = createClient();
  const t = await getTranslations("dashboard");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <Card className="p-5 text-center text-sm text-muted">{t("employee.noProfile")}</Card>
      </div>
    );
  }

  // Same config that drives nav + route guards: hide widgets for surfaces turned off.
  const access = await getEmployeeAccess(companyId);

  const [{ data: comp }, leaveReqs, { data: attRecords }, { data: payslipRows }] =
    await Promise.all([
      supabase
        .from("compensation")
        .select("base_salary, fixed_allowances")
        .eq("employee_id", employee.id)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getCompanyLeaveRequests(supabase, companyId),
      supabase
        .from("attendance_records")
        .select("event_at, kind")
        .eq("company_id", companyId)
        .eq("employee_id", employee.id)
        .gte("event_at", startOfDaysAgoJakartaIso(13))
        .order("event_at", { ascending: true }),
      access.salary && access.dashPay
        ? supabase
            .from("payslips")
            .select(
              "payroll_items(net_pay, gross_pay, base_salary, allowances, overtime_pay, pph21, bpjs_kes_employee, jht_employee, jp_employee, loan_deduction, payroll_runs(period_year, period_month))",
            )
            .eq("employee_id", employee.id)
            .order("issued_at", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: null }),
    ]);

  // --- Leave (this calendar year), with the next upcoming approved booking. ---
  // RLS already scopes leave reads, but filter to this user's own rows defensively.
  const myLeaves = leaveReqs.filter((r) => r.employeeUserId === user.id);
  const yearNow = new Date().getFullYear();
  const myYear = myLeaves.filter((r) => new Date(r.startDate).getFullYear() === yearNow);
  const approvedLeave = myYear.filter((r) => r.status === "approved").length;
  const pendingLeave = myYear.filter((r) => r.status === "pending").length;
  const rejectedLeave = myYear.filter((r) => r.status === "rejected").length;
  const daysUsed = myYear
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + r.days, 0);

  // --- Attendance: last 14 days strip + today's clocked-in state. ---
  const todayKey = jakartaDateKey(new Date().toISOString());
  const presentKeys = new Set<string>();
  let todayLatestKind: string | undefined;
  for (const r of (attRecords as { event_at: string; kind: string }[] | null) ?? []) {
    const key = jakartaDateKey(r.event_at);
    if (r.kind === "clock_in") presentKeys.add(key);
    if (key === todayKey) todayLatestKind = r.kind; // asc order → last wins
  }
  const clockedIn = todayLatestKind === "clock_in" || todayLatestKind === "break_end";
  const attDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + WIB_OFFSET_MS);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    return { key, present: presentKeys.has(key), weekend: dow === 0 || dow === 6 };
  });
  const presentCount = attDays.filter((d) => d.present).length;

  // --- Pay history: net-pay trend (oldest→newest) + latest payslip breakdown. ---
  type PayItem = {
    net_pay: number;
    gross_pay: number;
    base_salary: number;
    allowances: number;
    overtime_pay: number;
    pph21: number;
    bpjs_kes_employee: number;
    jht_employee: number;
    jp_employee: number;
    loan_deduction: number;
    payroll_runs: { period_year: number; period_month: number } | null;
  };
  const payItems = ((payslipRows as unknown as { payroll_items: PayItem | null }[] | null) ?? [])
    .map((r) => r.payroll_items)
    .filter((it): it is PayItem => Boolean(it?.payroll_runs))
    .sort((a, b) => {
      const ra = a.payroll_runs!.period_year * 12 + a.payroll_runs!.period_month;
      const rb = b.payroll_runs!.period_year * 12 + b.payroll_runs!.period_month;
      return ra - rb;
    });
  const payPoints: PayPoint[] = payItems.slice(-6).map((it) => ({
    label: (MONTH_NAMES_ID[it.payroll_runs!.period_month - 1] ?? "").slice(0, 3),
    net: it.net_pay,
  }));
  const latestPay = payItems[payItems.length - 1];

  // Full salary breakdown, always shown. Prefer the latest payslip; with no payslip
  // yet, estimate earnings from current compensation (deductions unknown → net = gross).
  const breakdown = latestPay
    ? {
        fromPayslip: true,
        base: latestPay.base_salary,
        allowances: latestPay.allowances,
        overtime: latestPay.overtime_pay,
        gross: latestPay.gross_pay,
        net: latestPay.net_pay,
        tax: latestPay.pph21,
        bpjs: latestPay.bpjs_kes_employee + latestPay.jht_employee + latestPay.jp_employee,
        loan: latestPay.loan_deduction,
      }
    : (() => {
        const base = comp?.base_salary ?? 0;
        const allowances = sumFixedAllowances(comp?.fixed_allowances);
        const gross = base + allowances;
        return {
          fromPayslip: false,
          base,
          allowances,
          overtime: 0,
          gross,
          net: gross,
          tax: 0,
          bpjs: 0,
          loan: 0,
        };
      })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("employee.greeting", { name: employee.full_name })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {access.salary && (
          <StatCard
            href="/profile"
            tone="brand"
            icon={<Wallet className="h-5 w-5" />}
            label={t("employee.salary")}
            value={comp ? formatRupiah(comp.base_salary) : "—"}
            hint={t("employee.salaryHint")}
          />
        )}
        {access.leave && (
          <StatCard
            href="/leave"
            tone="warning"
            icon={<CalendarDays className="h-5 w-5" />}
            label={t("employee.leave")}
            value={
              <>
                {approvedLeave}
                <span className="text-base text-muted"> {t("employee.leaveApproved")}</span>
              </>
            }
            hint={
              pendingLeave > 0
                ? t("employee.leavePending", { count: pendingLeave })
                : t("employee.leaveRequest")
            }
          />
        )}
        {access.attendance && (
          <StatCard
            href="/attendance"
            tone={clockedIn ? "success" : "brand"}
            icon={<Clock className="h-5 w-5" />}
            label={t("employee.attendance")}
            value={clockedIn ? t("employee.clockedIn") : t("employee.notClockedIn")}
            hint={t("employee.attendanceHint")}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {access.salary && access.dashPay && (
          <div className="lg:col-span-2">
            <PayTrendChart
              points={payPoints}
              title={t("employee.payTrend")}
              averageLabel={t("employee.payAverage")}
              emptyLabel={t("employee.payTrendEmpty")}
            />
          </div>
        )}

        {access.salary && (
          <SalaryBreakdownCard
            title={t("employee.breakdown")}
            takeHomeLabel={t("employee.takeHome")}
            grossLabel={t("employee.gross")}
            netLabel={t("employee.net")}
            gross={breakdown.gross}
            net={breakdown.net}
            earnings={[
              { label: t("employee.earnBase"), value: breakdown.base },
              { label: t("employee.earnAllowances"), value: breakdown.allowances },
              { label: t("employee.earnOvertime"), value: breakdown.overtime },
            ].filter((e) => e.value > 0)}
            deductions={[
              { label: t("employee.dedTax"), value: breakdown.tax, color: "#DC2626" },
              { label: t("employee.dedBpjs"), value: breakdown.bpjs, color: "#F59E0B" },
              { label: t("employee.dedLoan"), value: breakdown.loan, color: "#5B6675" },
            ]}
            estimateNote={breakdown.fromPayslip ? undefined : t("employee.breakdownEstimate")}
          />
        )}

        {access.leave && access.dashLeave && (
          <LeaveCard
            title={t("employee.leaveYear")}
            approved={approvedLeave}
            pending={pendingLeave}
            rejected={rejectedLeave}
            daysUsed={daysUsed}
            daysWord={t("employee.daysWord")}
            upcomingLabel={
              (() => {
                const next = myLeaves
                  .filter((r) => r.status === "approved" && r.startDate >= todayKey)
                  .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
                return next
                  ? t("employee.leaveUpcoming", {
                      range: formatDateRange(next.startDate, next.endDate),
                    })
                  : t("employee.leaveNone");
              })()
            }
            legend={{
              approved: t("employee.statusApproved"),
              pending: t("employee.statusPending"),
              rejected: t("employee.statusRejected"),
            }}
          />
        )}

        {access.attendance && access.dashAttendance && (
          <AttendanceStrip
            days={attDays}
            title={t("employee.attendance14")}
            presentLabel={t("employee.presentCount", { count: presentCount })}
          />
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  // Employees get a self-scoped overview; the company aggregates below are admin/manager-only.
  if (active.role === "employee") return <EmployeeDashboard companyId={active.id} />;

  const isAdmin = active.role === "owner" || active.role === "admin";

  const [
    { data: statusRows },
    { data: billing },
    { data: payrollRuns },
    { data: todayRecords },
    { count: shiftCount },
  ] = await Promise.all([
    supabase.from("employees").select("status").eq("company_id", active.id),
    supabase
      .from("company_billing")
      .select("plan, free_seat_limit, active_seats")
      .eq("company_id", active.id)
      .maybeSingle<Pick<CompanyBillingRow, "plan" | "free_seat_limit" | "active_seats">>(),
    isAdmin
      ? supabase
          .from("payroll_runs")
          .select("id, period_year, period_month, status, total_net")
          .eq("company_id", active.id)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: null }),
    supabase
      .from("attendance_records")
      .select("employee_id, kind")
      .eq("company_id", active.id)
      .gte("event_at", startOfTodayJakartaIso())
      .order("event_at", { ascending: false }),
    isAdmin
      ? supabase.from("shifts").select("id", { count: "exact", head: true }).eq("company_id", active.id)
      : Promise.resolve({ count: 0 }),
  ]);

  // Workforce headcount + status mix for the overview tiles/donut.
  const statuses = (statusRows as { status: string }[] | null) ?? [];
  const employeeCount = statuses.length;
  const statusCounts = {
    active: statuses.filter((s) => s.status === "active").length,
    probation: statuses.filter((s) => s.status === "probation").length,
    inactive: statuses.filter((s) => s.status === "inactive").length,
    terminated: statuses.filter((s) => s.status === "terminated").length,
  };

  // Payroll cost trend: oldest → newest net total across the last few runs.
  const runs = (payrollRuns as
    | { period_year: number; period_month: number; status: string; total_net: number }[]
    | null) ?? [];
  const latestRun = runs[0] ?? null;
  const payrollPoints: PayPoint[] = [...runs]
    .reverse()
    .map((r) => ({ label: (MONTH_NAMES_ID[r.period_month - 1] ?? "").slice(0, 3), net: r.total_net }));

  const presentToday = countPresent(
    (todayRecords as { employee_id: string; kind: string }[] | null) ?? [],
  );

  // Managers can't open /payroll; their third card is the leave approval queue instead.
  const pendingApprovals = isAdmin
    ? 0
    : (await getCompanyLeaveRequests(supabase, active.id)).filter((r) => r.status === "pending")
        .length;

  const plan = planMeta(billing?.plan ?? "free");
  const limit = billing?.free_seat_limit ?? 5;
  const used = employeeCount ?? 0;
  const isFree = plan.id === "free";
  const atLimit = isFree && used >= limit;

  const t = await getTranslations("dashboard");
  const tGlance = await getTranslations("glance");
  const tPlans = await getTranslations("plans");
  const tStatus = await getTranslations("payroll.status");
  const planName = tPlans(plan.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("company", { name: active.name })}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/glance">{tGlance("open")} →</Link>
        </Button>
      </div>

      {isAdmin && (
        <SetupChecklist
          hasEmployees={used > 0}
          hasShifts={(shiftCount ?? 0) > 0}
          hasPayroll={Boolean(latestRun)}
        />
      )}

      {isFree && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark">
          <span>
            {t("free.label")} <strong>{tPlans("free")}</strong>: {t("free.usage", { used, limit })}
            {atLimit ? t("free.atLimit") : t("free.noNpwp")}
          </span>
          {isAdmin && (
            <Button asChild size="sm" className="shrink-0">
              <Link href="/billing">{t("free.upgrade")}</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card asChild className="p-5 transition-colors hover:border-brand">
          <Link href="/employees">
            <div className="text-sm text-muted">{t("cards.employees")}</div>
            <div className="mt-1 text-2xl font-bold text-ink">
              {used}
              {isFree ? <span className="text-base text-muted"> / {limit}</span> : null}
            </div>
            <div className="mt-1 text-xs text-muted">{t("cards.planManage", { plan: planName })}</div>
          </Link>
        </Card>

        <Card asChild className="p-5 transition-colors hover:border-brand">
          <Link href="/attendance">
            <div className="text-sm text-muted">{t("cards.attendanceToday")}</div>
            <div className="mt-1 text-2xl font-bold text-ink">
              {presentToday}
              {used ? <span className="text-base text-muted"> / {used} {t("cards.present")}</span> : null}
            </div>
            <div className="mt-1 text-xs text-muted">{t("cards.liveLink")}</div>
          </Link>
        </Card>

        {isAdmin ? (
          <Card asChild className="p-5 transition-colors hover:border-brand">
            <Link href="/payroll">
              <div className="text-sm text-muted">{t("cards.lastPayroll")}</div>
              {latestRun ? (
                <>
                  <div className="mt-1 text-2xl font-bold text-ink">
                    {formatPeriod(latestRun.period_year, latestRun.period_month)}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {tStatus(latestRun.status)}
                    {latestRun.total_net ? ` · ${formatRupiah(latestRun.total_net)}` : ""} →
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-2xl font-bold text-ink">—</div>
                  <div className="mt-1 text-xs text-muted">{t("cards.runPayroll")}</div>
                </>
              )}
            </Link>
          </Card>
        ) : (
          <Card asChild className="p-5 transition-colors hover:border-brand">
            <Link href="/leave">
              <div className="text-sm text-muted">{t("manager.pendingApprovals")}</div>
              <div className="mt-1 text-2xl font-bold text-ink">{pendingApprovals}</div>
              <div className="mt-1 text-xs text-muted">{t("manager.reviewLeave")}</div>
            </Link>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {isAdmin && (
          <div className="lg:col-span-2">
            <PayTrendChart
              points={payrollPoints}
              title={t("cards.payrollTrend")}
              averageLabel={t("cards.avgCost")}
              emptyLabel={t("cards.payrollEmpty")}
            />
          </div>
        )}

        <SegmentDonutCard
          title={t("workforce.title")}
          centerTop={String(employeeCount)}
          centerBottom={t("workforce.totalWord")}
          segments={[
            { value: statusCounts.active, color: "#16A34A", label: t("workforce.active") },
            { value: statusCounts.probation, color: "#F59E0B", label: t("workforce.probation") },
            { value: statusCounts.inactive, color: "#5B6675", label: t("workforce.inactive") },
            { value: statusCounts.terminated, color: "#DC2626", label: t("workforce.terminated") },
          ]}
        />

        <SegmentDonutCard
          title={t("attendanceMix.title")}
          centerTop={String(presentToday)}
          centerBottom={t("attendanceMix.presentWord")}
          segments={[
            { value: presentToday, color: "#16A34A", label: t("attendanceMix.present") },
            {
              value: Math.max(0, employeeCount - presentToday),
              color: "#5B6675",
              label: t("attendanceMix.absent"),
            },
          ]}
        />
      </div>
    </div>
  );
}
