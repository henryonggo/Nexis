"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createReportJob, type ReportActionState } from "./actions";
import { REPORT_TYPES } from "@/lib/reports-format";
import type { RunOption } from "@/lib/reports";
import { SubmitButton } from "@/components/submit-button";

const initial: ReportActionState = {};

export function ReportForm({ runs }: { runs: RunOption[] }) {
  const t = useTranslations("reports.form");
  const tt = useTranslations("reports.types");
  const [state, action] = useFormState(createReportJob, initial);

  if (runs.length === 0) {
    return (
      <div className="nx-card">
        <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
        <p className="text-sm text-muted">{t("noRuns")}</p>
      </div>
    );
  }

  return (
    <div className="nx-card">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.ok && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t("created")}
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="payrollRunId">
            {t("period")}
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
            {t("reportType")}
          </label>
          <select id="reportType" name="reportType" className="nx-input" defaultValue="payroll_summary">
            {REPORT_TYPES.map((rt) => (
              <option key={rt.type} value={rt.type}>
                {tt(`${rt.type}.label`)}
              </option>
            ))}
          </select>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {REPORT_TYPES.map((rt) => (
              <li key={rt.type}>
                <span className="font-medium text-ink">{tt(`${rt.type}.label`)}:</span>{" "}
                {tt(`${rt.type}.description`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-1">
          <SubmitButton>{t("submit")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
