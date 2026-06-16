import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getCompanyLeaveRequests } from "@/lib/leave";
import { getEmployeeAccess } from "@/lib/access";
import { formatPeriod, formatRupiah } from "@/lib/payroll-format";
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

  const [{ data: comp }, leaveReqs, { data: todayRecords }] = await Promise.all([
    supabase
      .from("compensation")
      .select("base_salary")
      .eq("employee_id", employee.id)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCompanyLeaveRequests(supabase, companyId),
    supabase
      .from("attendance_records")
      .select("kind")
      .eq("company_id", companyId)
      .eq("employee_id", employee.id)
      .gte("event_at", startOfTodayJakartaIso())
      .order("event_at", { ascending: false })
      .limit(1),
  ]);

  // RLS already scopes leave reads, but filter to this user's own rows defensively.
  const myLeaves = leaveReqs.filter((r) => r.employeeUserId === user.id);
  const pendingLeave = myLeaves.filter((r) => r.status === "pending").length;
  const approvedLeave = myLeaves.filter((r) => r.status === "approved").length;

  const latestKind = (todayRecords as { kind: string }[] | null)?.[0]?.kind;
  const clockedIn = latestKind === "clock_in" || latestKind === "break_end";

  // Same config that drives nav + route guards: hide cards for surfaces turned off.
  const access = await getEmployeeAccess(companyId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("employee.greeting", { name: employee.full_name })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {access.salary && (
          <Card asChild className="p-5 transition-colors hover:border-brand">
            <Link href="/profile">
              <div className="text-sm text-muted">{t("employee.salary")}</div>
              <div className="mt-1 text-2xl font-bold text-ink">
                {comp ? formatRupiah(comp.base_salary) : "—"}
              </div>
              <div className="mt-1 text-xs text-muted">{t("employee.salaryHint")}</div>
            </Link>
          </Card>
        )}

        {access.leave && (
          <Card asChild className="p-5 transition-colors hover:border-brand">
            <Link href="/leave">
              <div className="text-sm text-muted">{t("employee.leave")}</div>
              <div className="mt-1 text-2xl font-bold text-ink">
                {approvedLeave}
                <span className="text-base text-muted"> {t("employee.leaveApproved")}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {pendingLeave > 0
                  ? t("employee.leavePending", { count: pendingLeave })
                  : t("employee.leaveRequest")}
              </div>
            </Link>
          </Card>
        )}

        {access.attendance && (
          <Card asChild className="p-5 transition-colors hover:border-brand">
            <Link href="/attendance">
              <div className="text-sm text-muted">{t("employee.attendance")}</div>
              <div className="mt-1 text-2xl font-bold text-ink">
                {clockedIn ? t("employee.clockedIn") : t("employee.notClockedIn")}
              </div>
              <div className="mt-1 text-xs text-muted">{t("employee.attendanceHint")}</div>
            </Link>
          </Card>
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

  const [{ count: employeeCount }, { data: billing }, { data: latestRun }, { data: todayRecords }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", active.id),
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
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("attendance_records")
        .select("employee_id, kind")
        .eq("company_id", active.id)
        .gte("event_at", startOfTodayJakartaIso())
        .order("event_at", { ascending: false }),
    ]);

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
  const tPlans = await getTranslations("plans");
  const tStatus = await getTranslations("payroll.status");
  const planName = tPlans(plan.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("company", { name: active.name })}</p>
      </div>

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
    </div>
  );
}
