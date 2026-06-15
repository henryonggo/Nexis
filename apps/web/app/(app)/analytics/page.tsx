import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getHeadcountStats,
  getPayrollTrend,
  getOvertimeTrend,
  getApprovalStats,
  getLeaveUsage,
} from "@/lib/analytics";
import { BarList, TrendChart } from "./charts";
import { PeriodFilter } from "./period-filter";
import { Card } from "@/components/ui/card";

const PERIOD_OPTIONS = [3, 6, 12];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { months?: string };
}) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const months = PERIOD_OPTIONS.includes(Number(searchParams.months))
    ? Number(searchParams.months)
    : 12;

  const t = await getTranslations("analytics");
  const isAdmin = active.role === "owner" || active.role === "admin";
  if (!isAdmin) {
    return (
      <Card className="max-w-lg p-8">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </Card>
    );
  }

  const year = new Date().getFullYear();
  const [headcount, trend, overtimeTrend, approvals, leaveUsage] = await Promise.all([
    getHeadcountStats(supabase, active.id),
    getPayrollTrend(supabase, active.id, months),
    getOvertimeTrend(supabase, active.id, months),
    getApprovalStats(supabase, active.id),
    getLeaveUsage(supabase, active.id, year),
  ]);

  const latest = trend[trend.length - 1];
  const pendingTotal = approvals.pendingLeave + approvals.pendingClaims;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
        </div>
        <PeriodFilter value={months} />
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={t("activeEmployees")}
          value={String(headcount.active)}
          hint={t("totalSuffix", { total: headcount.total })}
        />
        <Kpi
          label={t("lastGross")}
          value={latest ? formatRupiah(latest.gross) : "—"}
          hint={latest ? latest.periodLabel : t("noRun")}
        />
        <Kpi
          label={t("employerBpjs")}
          value={latest ? formatRupiah(latest.bpjsEmployer) : "—"}
          hint={latest ? t("pph21", { amount: formatRupiah(latest.pph21) }) : "—"}
        />
        <Kpi
          label={t("pendingApprovals")}
          value={String(pendingTotal)}
          hint={t("pendingBreakdown", { leave: approvals.pendingLeave, claims: approvals.pendingClaims })}
        />
      </div>

      {/* Payroll cost trend */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("trendTitle")}
        </h2>
        <TrendChart points={trend} emptyText={t("noTrend")} grossLabel={t("grossLabel")} />
      </Card>

      {/* Approved overtime hours per month */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("overtimeTitle")}
        </h2>
        <BarList items={overtimeTrend} unit={t("unitHours")} emptyText={t("noOvertime")} />
      </Card>

      {/* Headcount breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("byDepartment")}
          </h2>
          <BarList
            items={headcount.byDepartment}
            unit={t("unitPeople")}
            emptyText={t("noActiveEmployees")}
          />
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("byType")}
          </h2>
          <BarList
            items={headcount.byEmploymentType}
            unit={t("unitPeople")}
            emptyText={t("noActiveEmployees")}
          />
        </Card>
      </div>

      {/* Leave usage */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("leaveTitle", { year })}
        </h2>
        <BarList items={leaveUsage} unit={t("unitDays")} emptyText={t("noLeave")} />
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
