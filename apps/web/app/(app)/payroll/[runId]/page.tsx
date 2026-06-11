import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Database } from "@nexis/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { computeRunPreview, formatPeriod, formatRupiah } from "@/lib/payroll";
import { ActionBar } from "./actions-bar";
import { RunStatusStream } from "./status-stream";

type Status = Database["public"]["Enums"]["pay_period_status"];

interface DisplayLine {
  employeeId: string;
  name: string;
  terCategory: string | null;
  terRateBps: number | null;
  hasNpwp: boolean | null;
  gross: number;
  bpjsKesEmployee: number;
  bpjsKesEmployer: number;
  jhtEmployee: number;
  jhtEmployer: number;
  jpEmployee: number;
  jpEmployer: number;
  jkkEmployer: number;
  jkmEmployer: number;
  pph21: number;
  net: number;
  warnings: string[];
}

/** persisted payroll_items → display once a run has been processed by the worker. */
const PERSISTED_STATUSES: Status[] = ["completed", "paid"];

function formatRateBps(bps: number | null): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

export default async function PayrollRunPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;
  const t = await getTranslations("payroll");

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, period_year, period_month, status, total_gross, total_bpjs_employee, total_bpjs_employer, total_pph21, total_net, config_snapshot")
    .eq("id", params.runId)
    .eq("company_id", active.id)
    .maybeSingle();

  if (!run) notFound();

  const isPersisted = PERSISTED_STATUSES.includes(run.status);

  let lines: DisplayLine[] = [];
  let notices: string[] = [];
  let totals = {
    gross: run.total_gross,
    bpjsEmployee: run.total_bpjs_employee,
    bpjsEmployer: run.total_bpjs_employer,
    pph21: run.total_pph21,
    net: run.total_net,
  };

  if (isPersisted) {
    const { data: items } = await supabase
      .from("payroll_items")
      .select(
        "employee_id, gross_pay, bpjs_kes_employee, bpjs_kes_employer, jht_employee, jht_employer, jp_employee, jp_employer, jkk_employer, jkm_employer, pph21, net_pay, ter_category, ter_rate_bps",
      )
      .eq("payroll_run_id", run.id)
      .eq("company_id", active.id);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", active.id);
    const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

    lines = (items ?? []).map((it) => ({
      employeeId: it.employee_id,
      name: nameById.get(it.employee_id) ?? it.employee_id,
      terCategory: it.ter_category,
      terRateBps: it.ter_rate_bps,
      hasNpwp: null,
      gross: it.gross_pay,
      bpjsKesEmployee: it.bpjs_kes_employee,
      bpjsKesEmployer: it.bpjs_kes_employer,
      jhtEmployee: it.jht_employee,
      jhtEmployer: it.jht_employer,
      jpEmployee: it.jp_employee,
      jpEmployer: it.jp_employer,
      jkkEmployer: it.jkk_employer,
      jkmEmployer: it.jkm_employer,
      pph21: it.pph21,
      net: it.net_pay,
      warnings: [],
    }));
  } else {
    // Live "dry run" estimate (run not yet processed by the worker).
    const snapshotRunType =
      (run.config_snapshot as { runType?: string } | null)?.runType === "thr" ? "thr" : "monthly";
    const preview = await computeRunPreview(supabase, active.id, {
      year: run.period_year,
      month: run.period_month,
      runType: snapshotRunType,
      plan: active.plan,
    });
    notices = preview.notices;
    totals = preview.totals;
    lines = preview.lines.map((l) => ({
      employeeId: l.employeeId,
      name: l.name,
      terCategory: l.terCategory,
      terRateBps: l.result?.terRateBps ?? null,
      hasNpwp: l.hasNpwp,
      gross: l.result?.gross ?? l.thrAmount ?? 0,
      bpjsKesEmployee: l.result?.bpjsKesEmployee ?? 0,
      bpjsKesEmployer: l.result?.bpjsKesEmployer ?? 0,
      jhtEmployee: l.result?.jhtEmployee ?? 0,
      jhtEmployer: l.result?.jhtEmployer ?? 0,
      jpEmployee: l.result?.jpEmployee ?? 0,
      jpEmployer: l.result?.jpEmployer ?? 0,
      jkkEmployer: l.result?.jkkEmployer ?? 0,
      jkmEmployer: l.result?.jkmEmployer ?? 0,
      pph21: l.result?.pph21 ?? 0,
      net: l.result?.netPay ?? l.thrAmount ?? 0,
      warnings: l.warnings,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/payroll" className="text-sm text-muted hover:underline">{t("detail.back")}</Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-ink">
            {t("detail.heading", { period: formatPeriod(run.period_year, run.period_month) })}
          </h1>
          <RunStatusStream runId={run.id} initialStatus={run.status} />
        </div>
        {!isPersisted && <p className="mt-1 text-sm text-muted">{t("estimateNote")}</p>}
      </div>

      {run.status === "queued" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {t("queuedNote")}
        </div>
      )}

      {notices.map((n) => (
        <div key={n} className="rounded-lg border border-warning/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {n}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label={t("summary.gross")} value={totals.gross} />
        <SummaryCard label={t("summary.bpjsEmployee")} value={totals.bpjsEmployee} />
        <SummaryCard label={t("summary.pph21")} value={totals.pph21} />
        <SummaryCard label={t("summary.net")} value={totals.net} emphasize />
      </div>

      <ActionBar runId={run.id} status={run.status} />

      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("columns.employee")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.pph21")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("columns.gross")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("columns.deductions")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("summary.net")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t("detail.noEmployees")}
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const employeeDeductions = line.bpjsKesEmployee + line.jhtEmployee + line.jpEmployee + line.pph21;
                return (
                  <tr key={line.employeeId} className="border-t border-[color:var(--border)] align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{line.name}</div>
                      {line.warnings.map((w) => (
                        <div key={w} className="mt-0.5 text-xs text-amber-700">⚠ {w}</div>
                      ))}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-brand hover:underline">{t("breakdown")}</summary>
                        <dl className="mt-2 space-y-1 text-xs text-muted">
                          <BreakdownRow label={t("breakdownRows.bpjsKesEmployee")} value={line.bpjsKesEmployee} />
                          <BreakdownRow label={t("breakdownRows.bpjsKesEmployer")} value={line.bpjsKesEmployer} />
                          <BreakdownRow label={t("breakdownRows.jhtEmployee")} value={line.jhtEmployee} />
                          <BreakdownRow label={t("breakdownRows.jhtEmployer")} value={line.jhtEmployer} />
                          <BreakdownRow label={t("breakdownRows.jpEmployee")} value={line.jpEmployee} />
                          <BreakdownRow label={t("breakdownRows.jpEmployer")} value={line.jpEmployer} />
                          <BreakdownRow label={t("breakdownRows.jkkEmployer")} value={line.jkkEmployer} />
                          <BreakdownRow label={t("breakdownRows.jkmEmployer")} value={line.jkmEmployer} />
                          <BreakdownRow label={t("breakdownRows.pph21")} value={line.pph21} />
                        </dl>
                      </details>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {t("detail.terCategory", { category: line.terCategory ?? "—", rate: formatRateBps(line.terRateBps) })}
                      {line.hasNpwp === false && <span className="ml-1 text-amber-700">{t("noNpwp")}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatRupiah(line.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">−{formatRupiah(employeeDeductions, { withSymbol: false })}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">{formatRupiah(line.net)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className={`rounded-lg border border-[color:var(--border)] p-3 ${emphasize ? "bg-brand-light/50" : "bg-white"}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-ink">{formatRupiah(value)}</div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatRupiah(value)}</dd>
    </div>
  );
}
