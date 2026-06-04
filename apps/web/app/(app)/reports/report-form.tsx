"use client";

import { useFormState } from "react-dom";
import { createReportJob, type ReportActionState } from "./actions";
import { REPORT_TYPES } from "@/lib/reports-format";
import type { RunOption } from "@/lib/reports";
import { SubmitButton } from "@/components/submit-button";

const initial: ReportActionState = {};

export function ReportForm({ runs }: { runs: RunOption[] }) {
  const [state, action] = useFormState(createReportJob, initial);

  if (runs.length === 0) {
    return (
      <div className="nx-card">
        <h2 className="mb-1 text-lg font-semibold text-ink">Buat laporan</h2>
        <p className="text-sm text-muted">
          Belum ada run payroll yang selesai. Selesaikan satu run payroll dulu untuk
          membuat laporan & ekspor.
        </p>
      </div>
    );
  }

  return (
    <div className="nx-card">
      <h2 className="mb-1 text-lg font-semibold text-ink">Buat laporan</h2>
      <p className="mb-4 text-sm text-muted">
        Pilih run payroll dan jenis laporan. Berkas Excel akan dibuat dan dapat diunduh
        saat statusnya “Selesai”.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.ok && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Laporan sedang dibuat. Segarkan halaman dalam beberapa saat untuk mengunduh.
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="payrollRunId">
            Periode payroll
          </label>
          <select id="payrollRunId" name="payrollRunId" className="nx-input" defaultValue={runs[0]!.id}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.periodLabel}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="nx-label" htmlFor="reportType">
            Jenis laporan
          </label>
          <select id="reportType" name="reportType" className="nx-input" defaultValue="payroll_summary">
            {REPORT_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {REPORT_TYPES.map((t) => (
              <li key={t.type}>
                <span className="font-medium text-ink">{t.label}:</span> {t.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-1">
          <SubmitButton>Buat laporan</SubmitButton>
        </div>
      </form>
    </div>
  );
}
