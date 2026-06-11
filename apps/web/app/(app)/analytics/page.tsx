import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getHeadcountStats,
  getPayrollTrend,
  getApprovalStats,
  getLeaveUsage,
} from "@/lib/analytics";
import { BarList, TrendChart } from "./charts";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("analytics");
  const isAdmin = active.role === "owner" || active.role === "admin";
  if (!isAdmin) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </div>
    );
  }

  const year = new Date().getFullYear();
  const [headcount, trend, approvals, leaveUsage] = await Promise.all([
    getHeadcountStats(supabase, active.id),
    getPayrollTrend(supabase, active.id),
    getApprovalStats(supabase, active.id),
    getLeaveUsage(supabase, active.id, year),
  ]);

  const latest = trend[trend.length - 1];
  const pendingTotal = approvals.pendingLeave + approvals.pendingClaims;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
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
      <section className="nx-card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("trendTitle")}
        </h2>
        <TrendChart points={trend} emptyText={t("noTrend")} grossLabel={t("grossLabel")} />
      </section>

      {/* Headcount breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="nx-card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("byDepartment")}
          </h2>
          <BarList
            items={headcount.byDepartment}
            unit={t("unitPeople")}
            emptyText={t("noActiveEmployees")}
          />
        </section>
        <section className="nx-card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("byType")}
          </h2>
          <BarList
            items={headcount.byEmploymentType}
            unit={t("unitPeople")}
            emptyText={t("noActiveEmployees")}
          />
        </section>
      </div>

      {/* Leave usage */}
      <section className="nx-card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {t("leaveTitle", { year })}
        </h2>
        <BarList items={leaveUsage} unit={t("unitDays")} emptyText={t("noLeave")} />
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-white p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
