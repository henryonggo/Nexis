import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getCompanyLeaveRequests } from "@/lib/leave";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "../payroll/status-badge";
import { formatPeriod, formatRupiah, MONTH_NAMES_ID } from "@/lib/payroll-format";
import type { Database } from "@nexis/types";

type Status = Database["public"]["Enums"]["pay_period_status"];

/**
 * Glance — a calm, read-only "at a glance" view of the company, built for a quick
 * phone check-in. No actions, no nav clutter: just the few things an owner/admin
 * wants to see (is payroll on track, who's in today, what's waiting on me), shown
 * large and legible. Everything actionable lives in the full app.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Start of "today" in Asia/Jakarta (WIB, UTC+7), as a UTC ISO string. */
function startOfTodayJakartaIso(): string {
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startWibUtcMs = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate());
  return new Date(startWibUtcMs - WIB_OFFSET_MS).toISOString();
}

/** Count employees whose latest attendance event today means they're present. */
function countPresent(records: { employee_id: string; kind: string }[]): number {
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

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-bold tracking-tight text-ink tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </Card>
  );
}

export default async function GlancePage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) redirect("/dashboard");

  // Employees already have a tailored self-service dashboard; glance is the
  // company overview for owner/admin/manager.
  if (active.role === "employee") redirect("/dashboard");
  const isAdmin = active.role === "owner" || active.role === "admin";

  const [{ data: statusRows }, { data: billing }, { data: payrollRuns }, { data: todayRecords }] =
    await Promise.all([
      supabase.from("employees").select("status").eq("company_id", active.id),
      supabase
        .from("company_billing")
        .select("plan, free_seat_limit")
        .eq("company_id", active.id)
        .maybeSingle<{ plan: string; free_seat_limit: number }>(),
      isAdmin
        ? supabase
            .from("payroll_runs")
            .select("id, period_year, period_month, status, total_net")
            .eq("company_id", active.id)
            .order("period_year", { ascending: false })
            .order("period_month", { ascending: false })
            .limit(4)
        : Promise.resolve({ data: null }),
      supabase
        .from("attendance_records")
        .select("employee_id, kind")
        .eq("company_id", active.id)
        .gte("event_at", startOfTodayJakartaIso())
        .order("event_at", { ascending: false }),
    ]);

  const statuses = (statusRows as { status: string }[] | null) ?? [];
  const headcount = statuses.length;
  const mix = {
    active: statuses.filter((s) => s.status === "active").length,
    probation: statuses.filter((s) => s.status === "probation").length,
    inactive: statuses.filter((s) => s.status === "inactive").length,
    terminated: statuses.filter((s) => s.status === "terminated").length,
  };

  const runs =
    (payrollRuns as
      | { id: string; period_year: number; period_month: number; status: Status; total_net: number }[]
      | null) ?? [];
  const latestRun = runs[0] ?? null;

  const presentToday = countPresent(
    (todayRecords as { employee_id: string; kind: string }[] | null) ?? [],
  );

  const pendingLeave = (await getCompanyLeaveRequests(supabase, active.id)).filter(
    (r) => r.status === "pending",
  ).length;

  const isFree = (billing?.plan ?? "free") === "free";
  const limit = billing?.free_seat_limit ?? 5;

  const locale = await getLocale();
  const t = await getTranslations("glance");
  const tw = await getTranslations("dashboard.workforce");
  const tc = await getTranslations("dashboard.cards");

  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(now);

  const segments = [
    { value: mix.active, color: "#16A34A", label: tw("active") },
    { value: mix.probation, color: "#F59E0B", label: tw("probation") },
    { value: mix.inactive, color: "#5B6675", label: tw("inactive") },
    { value: mix.terminated, color: "#DC2626", label: tw("terminated") },
  ].filter((s) => s.value > 0);
  const segTotal = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="mx-auto max-w-md space-y-5 pb-10">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{active.name}</h1>
        <p className="text-xs text-muted">{t("asOf", { time: timeLabel })}</p>
      </header>

      {/* Hero — latest payroll, the thing you most want to glance at. */}
      {isAdmin && (
        <Card className="p-6">
          <div className="text-sm text-muted">{t("latestPayroll")}</div>
          {latestRun ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-2xl font-bold text-ink">
                  {formatPeriod(latestRun.period_year, latestRun.period_month)}
                </span>
                <StatusBadge status={latestRun.status} />
              </div>
              {latestRun.total_net ? (
                <div className="mt-3 text-3xl font-bold tracking-tight text-ink tabular-nums">
                  {formatRupiah(latestRun.total_net)}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-2 text-lg font-semibold text-muted">{t("noPayroll")}</div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Metric
          label={tc("employees")}
          value={isFree ? `${headcount}/${limit}` : String(headcount)}
        />
        <Metric
          label={tc("attendanceToday")}
          value={`${presentToday}/${headcount}`}
          sub={tc("present")}
        />
        <Metric label={t("pendingLeave")} value={String(pendingLeave)} />
        <Metric label={tw("active")} value={String(mix.active)} />
      </div>

      {/* Workforce mix — a single calm bar, no chart libs, no interaction. */}
      {segments.length > 0 && (
        <Card className="p-5">
          <div className="text-sm text-muted">{tw("title")}</div>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
            {segments.map((s) => (
              <div
                key={s.label}
                style={{ width: `${(s.value / segTotal) * 100}%`, backgroundColor: s.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label} · <span className="font-semibold text-ink">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent runs — read-only list. */}
      {isAdmin && runs.length > 0 && (
        <Card className="p-5">
          <div className="text-sm text-muted">{t("recentRuns")}</div>
          <ul className="mt-3 divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm font-medium text-ink">
                  {MONTH_NAMES_ID[r.period_month - 1]} {r.period_year}
                </span>
                <span className="flex items-center gap-3">
                  {r.total_net ? (
                    <span className="text-sm tabular-nums text-muted">
                      {formatRupiah(r.total_net)}
                    </span>
                  ) : null}
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
