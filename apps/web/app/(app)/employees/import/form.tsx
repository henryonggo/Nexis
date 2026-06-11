"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { importEmployees, type ImportResult } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: ImportResult = {};

const SAMPLE = `full_name,employee_no,email,position,department,base_salary
Budi Santoso,EMP001,budi@contoh.id,Staf,Operasional,6000000
Siti Aminah,EMP002,siti@contoh.id,Akuntan,Keuangan,8500000`;

export function ImportForm() {
  const t = useTranslations("employees.import");
  const [state, action] = useFormState(importEmployees, initial);

  return (
    <div className="space-y-4">
      <form action={action} className="nx-card max-w-2xl space-y-4">
        {state.error && <div className="nx-error">{state.error}</div>}
        {typeof state.created === "number" && (
          <div className="nx-success">
            {t("created", { count: state.created })}
            {state.stoppedAtLimit && t("stoppedAtLimit")}
          </div>
        )}

        <div>
          <label className="nx-label" htmlFor="csv">{t("pasteCsv")}</label>
          <textarea
            id="csv"
            name="csv"
            className="nx-input h-48 font-mono text-xs"
            placeholder={SAMPLE}
            required
          />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>

      {state.failures && state.failures.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-amber-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-amber-800">{t("skippedRows")}</p>
          <ul className="space-y-1 text-amber-800">
            {state.failures.map((f, i) => (
              <li key={i}>{t("rowLine", { line: f.line, name: f.name, reason: f.reason })}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
