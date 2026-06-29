import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Database } from "@nexis/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { computeRunPreview, PayrollConfigError, formatPeriod, formatRupiah } from "@/lib/payroll";
import { formatDateRange } from "@/lib/date";
import { ActionBar } from "./actions-bar";
import { CashPaymentPanel, type CashLine } from "./cash-payment-panel";
import { RunStatusStream } from "./status-stream";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

type Status = Database["public"]["Enums"]["pay_period_status"];

interface DisplayLine {
  employeeId: string;
  name: string;
  itemId: string | null;
  paidAt: string | null;
  paidMethod: string | null;
  daysWorked: number | null;
  terCategory: string | null;
  terRateBps: number | null;
  hasNpwp: boolean | null;
  payslipId: string | null;
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
  const isAdmin = active.role === "owner" || active.role === "admin";
  const t = await getTranslations("payroll");

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, period_year, period_month, status, total_gross, total_bpjs_employee, total_bpjs_employer, total_pph21, total_net, config_snapshot")
    .eq("id", params.runId)
    .eq("company_id", active.id)
    .maybeSingle();

  if (!run) notFound();

  // Fetch previous month's completed/paid run for comparison
  const prevYear = run.period_month === 1 ? run.period_year - 1 : run.period_year;
  const prevMonth = run.period_month === 1 ? 12 : run.period_month - 1;

  const { data: prevRun } = await supabase
    .from("payroll_runs")
    .select("id, total_gross, total_bpjs_employee, total_bpjs_employer, total_pph21, total_net")
    .eq("company_id", active.id)
    .eq("period_year", prevYear)
    .eq("period_month", prevMonth)
    .in("status", ["completed", "paid"])
    .maybeSingle();

  const prevItemsMap = new Map<string, { gross: number; net: number; pph21: number }>();
  if (prevRun) {
    const { data: prevItems } = await supabase
      .from("payroll_items")
      .select("employee_id, gross_pay, net_pay, pph21")
      .eq("payroll_run_id", prevRun.id);
    if (prevItems) {
      for (const it of prevItems) {
        prevItemsMap.set(it.employee_id, {
          gross: Number(it.gross_pay),
          net: Number(it.net_pay),
          pph21: Number(it.pph21),
        });
      }
    }
  }

  const isPersisted = PERSISTED_STATUSES.includes(run.status);

  // P1-4: approved *unpaid* leave overlapping this period, per employee — shown as
  // an informational note so HR can sanity-check absence deductions before approving.
  const periodStart = `${run.period_year}-${String(run.period_month).padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(run.period_year, run.period_month, 0))
    .toISOString()
    .slice(0, 10);
  const { data: unpaidLeave } = await supabase
    .from("leave_requests")
    .select("employee_id, start_date, end_date, days, leave_types!inner(name, paid)")
    .eq("company_id", active.id)
    .eq("status", "approved")
    .eq("leave_types.paid", false)
    .lte("start_date", periodEnd)
    .gte("end_date", periodStart);

  const absenceByEmployee = new Map<
    string,
    { leaveTypeName: string; startDate: string; endDate: string; days: number }[]
  >();
  for (const r of (unpaidLeave as
    | { employee_id: string; start_date: string; end_date: string; days: number; leave_types: { name: string } | null }[]
    | null) ?? []) {
    const list = absenceByEmployee.get(r.employee_id) ?? [];
    list.push({
      leaveTypeName: r.leave_types?.name ?? "—",
      startDate: r.start_date,
      endDate: r.end_date,
      days: Number(r.days),
    });
    absenceByEmployee.set(r.employee_id, list);
  }

  // Persisted payroll_items + payslips exist once the worker has processed the
  // run. We surface them whenever they exist — not only for completed/paid runs —
  // so payslips already generated for a run that's still stuck in queued/processing
  // (e.g. the worker wrote the items + PDFs but never flipped the run status) stay
  // visible and downloadable instead of being hidden behind a live estimate.
  const { data: persistedItems } = await supabase
    .from("payroll_items")
    .select(
      "id, paid_at, paid_method, days_worked, employee_id, gross_pay, bpjs_kes_employee, bpjs_kes_employer, jht_employee, jht_employer, jp_employee, jp_employer, jkk_employer, jkm_employer, pph21, net_pay, ter_category, ter_rate_bps",
    )
    .eq("payroll_run_id", run.id)
    .eq("company_id", active.id);

  const hasPersistedItems = (persistedItems?.length ?? 0) > 0;
  // A run is "official" only when completed/paid; when items exist on a not-yet-
  // completed run we still show them, with a banner explaining the run is pending.
  const showPersisted = isPersisted || hasPersistedItems;
  const pendingPayslips = hasPersistedItems && !isPersisted;

  let lines: DisplayLine[] = [];
  let notices: string[] = [];
  let previewError: string | null = null;
  let totals = {
    gross: run.total_gross,
    bpjsEmployee: run.total_bpjs_employee,
    bpjsEmployer: run.total_bpjs_employer,
    pph21: run.total_pph21,
    net: run.total_net,
  };

  if (showPersisted) {
    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", active.id);
    const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

    // Payslip PDFs for this run, so admins can download per employee from the web.
    const { data: payslips } = await supabase
      .from("payslips")
      .select("id, employee_id, payroll_items!inner(payroll_run_id)")
      .eq("company_id", active.id)
      .eq("payroll_items.payroll_run_id", run.id);
    const payslipByEmployee = new Map(
      (payslips ?? []).map((p) => [p.employee_id, p.id]),
    );

    lines = (persistedItems ?? []).map((it) => ({
      employeeId: it.employee_id,
      name: nameById.get(it.employee_id) ?? it.employee_id,
      itemId: it.id,
      paidAt: it.paid_at,
      paidMethod: it.paid_method,
      daysWorked: it.days_worked,
      terCategory: it.ter_category,
      terRateBps: it.ter_rate_bps,
      hasNpwp: null,
      payslipId: payslipByEmployee.get(it.employee_id) ?? null,
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

    // Sum the authoritative item figures. For a completed/paid run this equals the
    // worker-written run totals, but for a run still pending (queued/processing
    // with items already generated) the run row only holds the stale draft
    // estimate — so derive the summary from the items to match the rows shown.
    totals = lines.reduce(
      (acc, l) => ({
        gross: acc.gross + l.gross,
        bpjsEmployee: acc.bpjsEmployee + l.bpjsKesEmployee + l.jhtEmployee + l.jpEmployee,
        bpjsEmployer:
          acc.bpjsEmployer + l.bpjsKesEmployer + l.jhtEmployer + l.jpEmployer + l.jkkEmployer + l.jkmEmployer,
        pph21: acc.pph21 + l.pph21,
        net: acc.net + l.net,
      }),
      { gross: 0, bpjsEmployee: 0, bpjsEmployer: 0, pph21: 0, net: 0 },
    );
  } else {
    // Live "dry run" estimate (run not yet processed by the worker).
    const snapshotRunType =
      (run.config_snapshot as { runType?: string } | null)?.runType === "thr" ? "thr" : "monthly";
    let preview;
    try {
      preview = await computeRunPreview(supabase, active.id, {
        year: run.period_year,
        month: run.period_month,
        runType: snapshotRunType,
        plan: active.plan,
      });
    } catch (err) {
      // A transient reference-config load failure must not crash the whole run
      // page — show the persisted estimate totals + a retryable notice instead.
      if (!(err instanceof PayrollConfigError)) throw err;
      previewError = err.message;
      preview = null;
    }
    notices = preview?.notices ?? [];
    totals = preview?.totals ?? totals;
    lines = (preview?.lines ?? []).map((l) => ({
      employeeId: l.employeeId,
      name: l.name,
      itemId: null,
      paidAt: null,
      paidMethod: null,
      daysWorked: l.daysWorked ?? null,
      terCategory: l.terCategory,
      terRateBps: l.result?.terRateBps ?? null,
      hasNpwp: l.hasNpwp,
      payslipId: null,
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

  const totalsDiff = prevRun
    ? {
        gross: totals.gross - prevRun.total_gross,
        net: totals.net - prevRun.total_net,
        pph21: totals.pph21 - prevRun.total_pph21,
      }
    : null;

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
        {!showPersisted && <p className="mt-1 text-sm text-muted">{t("estimateNote")}</p>}
      </div>

      {/* Run is queued and nothing has been generated yet — genuinely waiting. */}
      {run.status === "queued" && !hasPersistedItems && <Alert variant="info">{t("queuedNote")}</Alert>}

      {/* Items/payslips exist but the run hasn't been finalized to completed/paid. */}
      {pendingPayslips && <Alert variant="info">{t("detail.pendingPayslipsNote")}</Alert>}

      {previewError && <Alert variant="destructive">{previewError}</Alert>}

      {notices.map((n) => (
        <Alert key={n} variant="warning">{n}</Alert>
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label={t("summary.gross")} value={totals.gross} diff={totalsDiff?.gross} />
        <SummaryCard label={t("summary.bpjsEmployee")} value={totals.bpjsEmployee} />
        <SummaryCard label={t("summary.pph21")} value={totals.pph21} diff={totalsDiff?.pph21} />
        <SummaryCard label={t("summary.net")} value={totals.net} diff={totalsDiff?.net} emphasize />
      </div>

      <ActionBar runId={run.id} status={run.status} />

      {showPersisted && isAdmin && (
        <CashPaymentPanel
          runId={run.id}
          lines={lines
            .filter((l): l is DisplayLine & { itemId: string } => l.itemId !== null)
            .map(
              (l): CashLine => ({
                itemId: l.itemId,
                name: l.name,
                net: l.net,
                paidAt: l.paidAt,
                paidMethod: l.paidMethod,
              }),
            )}
        />
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.employee")}</TableHead>
              <TableHead>{t("columns.pph21")}</TableHead>
              <TableHead className="text-right">{t("columns.gross")}</TableHead>
              <TableHead className="text-right">{t("columns.deductions")}</TableHead>
              <TableHead className="text-right">{t("summary.net")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted">
                  {t("detail.noEmployees")}
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line) => {
                const employeeDeductions = line.bpjsKesEmployee + line.jhtEmployee + line.jpEmployee + line.pph21;
                const prev = prevItemsMap.get(line.employeeId);
                const isNew = prevRun && !prev;
                const grossDiff = prev ? line.gross - prev.gross : 0;
                const netDiff = prev ? line.net - prev.net : 0;

                return (
                  <TableRow key={line.employeeId} className="align-top">
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink">{line.name}</span>
                        {line.daysWorked != null && (
                          <span className="inline-flex items-center rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-semibold text-brand-dark border border-brand/20">
                            {t("detail.daysWorked", { days: line.daysWorked })}
                          </span>
                        )}
                        {isNew && (
                          <span className="inline-flex items-center rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info border border-info/20">
                            {t("detail.newBadge")}
                          </span>
                        )}
                      </div>
                      {line.warnings.map((w) => (
                        <div
                          key={w}
                          className="mt-1 text-[11px] font-medium bg-warning/10 border border-warning/20 text-warning px-2 py-0.5 rounded flex items-center gap-1.5 w-fit"
                        >
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                            {w}
                          </span>
                          <Link
                            href={`/employees/${line.employeeId}`}
                            className="underline hover:text-warning/80 ml-1 font-semibold"
                          >
                            {t("detail.updateProfile")}
                          </Link>
                        </div>
                      ))}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-brand hover:underline">{t("breakdown")}</summary>
                        <dl className="mt-2 space-y-1 text-xs text-muted">
                          <BreakdownRow label={t("breakdownRows.bpjsKesEmployee")} value={line.bpjsKesEmployee} hint={t("explain.bpjsKes")} />
                          <BreakdownRow label={t("breakdownRows.bpjsKesEmployer")} value={line.bpjsKesEmployer} hint={t("explain.bpjsKes")} />
                          <BreakdownRow label={t("breakdownRows.jhtEmployee")} value={line.jhtEmployee} hint={t("explain.jht")} />
                          <BreakdownRow label={t("breakdownRows.jhtEmployer")} value={line.jhtEmployer} hint={t("explain.jht")} />
                          <BreakdownRow label={t("breakdownRows.jpEmployee")} value={line.jpEmployee} hint={t("explain.jp")} />
                          <BreakdownRow label={t("breakdownRows.jpEmployer")} value={line.jpEmployer} hint={t("explain.jp")} />
                          <BreakdownRow label={t("breakdownRows.jkkEmployer")} value={line.jkkEmployer} hint={t("explain.jkk")} />
                          <BreakdownRow label={t("breakdownRows.jkmEmployer")} value={line.jkmEmployer} hint={t("explain.jkm")} />
                          <BreakdownRow label={t("breakdownRows.pph21")} value={line.pph21} hint={t("explain.pph21")} />
                        </dl>
                      </details>
                      {(() => {
                        const absences = absenceByEmployee.get(line.employeeId);
                        if (!absences?.length) return null;
                        const totalDays = absences.reduce((s, a) => s + a.days, 0);
                        return (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-medium text-warning hover:underline">
                              {t("detail.absence", { days: totalDays })}
                            </summary>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted">
                              {absences.map((a, i) => (
                                <li key={i}>
                                  {a.leaveTypeName}: {formatDateRange(a.startDate, a.endDate)} · {a.days} {t("detail.absenceDaysUnit")}
                                </li>
                              ))}
                            </ul>
                          </details>
                        );
                      })()}
                      {line.payslipId && (
                        <a
                          href={`/payroll/${run.id}/payslip/${line.payslipId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {t("detail.downloadPayslip")}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {t("detail.terCategory", { category: line.terCategory ?? "—", rate: formatRateBps(line.terRateBps) })}
                      {line.hasNpwp === false && <span className="ml-1 text-warning">{t("noNpwp")}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink">
                      <div>{formatRupiah(line.gross)}</div>
                      {grossDiff !== 0 && (
                        <div
                          className={`text-[10px] font-semibold mt-0.5 ${
                            grossDiff > 0 ? "text-flow-in" : "text-flow-out"
                          }`}
                        >
                          {grossDiff > 0 ? "▲ +" : "▼ -"}{formatRupiah(Math.abs(grossDiff), { withSymbol: false })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink">−{formatRupiah(employeeDeductions, { withSymbol: false })}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-ink">
                      <div>{formatRupiah(line.net)}</div>
                      {netDiff !== 0 && (
                        <div
                          className={`text-[10px] font-semibold mt-0.5 ${
                            netDiff > 0 ? "text-flow-in" : "text-flow-out"
                          }`}
                        >
                          {netDiff > 0 ? "▲ +" : "▼ -"}{formatRupiah(Math.abs(netDiff), { withSymbol: false })}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  diff,
  emphasize,
}: {
  label: string;
  value: number;
  diff?: number;
  emphasize?: boolean;
}) {
  return (
    <Card className={`p-3 ${emphasize ? "border-brand/30 bg-brand-light/50" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-1 flex-wrap">
        <div className="text-lg font-bold tabular-nums text-ink">{formatRupiah(value)}</div>
        {diff != null && diff !== 0 && (
          <span
            className={`text-xs font-semibold ${
              diff > 0 ? "text-flow-in" : "text-flow-out"
            }`}
          >
            {diff > 0 ? "▲ +" : "▼ "}{formatRupiah(Math.abs(diff), { withSymbol: false })}
          </span>
        )}
      </div>
    </Card>
  );
}

function BreakdownRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex items-center gap-1">
        {label}
        {hint && (
          <span
            title={hint}
            aria-label={hint}
            className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-border text-[9px] leading-none text-muted"
          >
            ?
          </span>
        )}
      </dt>
      <dd className="tabular-nums">{formatRupiah(value)}</dd>
    </div>
  );
}
