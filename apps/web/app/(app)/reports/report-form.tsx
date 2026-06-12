"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createReportJob, type ReportActionState } from "./actions";
import { REPORT_TYPES } from "@/lib/reports-format";
import type { RunOption } from "@/lib/reports";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: ReportActionState = {};

export function ReportForm({ runs }: { runs: RunOption[] }) {
  const t = useTranslations("reports.form");
  const tt = useTranslations("reports.types");
  const [state, action] = useFormState(createReportJob, initial);

  if (runs.length === 0) {
    return (
      <Card className="p-8">
        <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
        <p className="text-sm text-muted">{t("noRuns")}</p>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.ok && <Alert variant="success" className="mb-4">{t("created")}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="payrollRunId">{t("period")}</Label>
          <select id="payrollRunId" name="payrollRunId" className={fieldClasses} defaultValue={runs[0]!.id}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.periodLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reportType">{t("reportType")}</Label>
          <select id="reportType" name="reportType" className={fieldClasses} defaultValue="payroll_summary">
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
    </Card>
  );
}
