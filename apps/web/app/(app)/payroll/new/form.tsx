"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createDraftRun, type RunActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: RunActionState = {};

export function NewRunForm({
  defaultYear,
  defaultMonth,
}: {
  defaultYear: number;
  defaultMonth: number;
}) {
  const t = useTranslations("payroll.newRun");
  const months = t.raw("months") as string[];
  const [state, action] = useFormState(createDraftRun, initial);
  const years = [defaultYear + 1, defaultYear, defaultYear - 1, defaultYear - 2];

  return (
    <div className="nx-card max-w-lg">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="month">{t("month")}</label>
            <select id="month" name="month" defaultValue={defaultMonth} className="nx-input">
              {months.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="nx-label" htmlFor="year">{t("year")}</label>
            <select id="year" name="year" defaultValue={defaultYear} className="nx-input">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="nx-label" htmlFor="runType">{t("runType")}</label>
          <select id="runType" name="runType" defaultValue="monthly" className="nx-input">
            <option value="monthly">{t("monthly")}</option>
            <option value="thr">{t("thr")}</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <SubmitButton>{t("submit")}</SubmitButton>
          <Link href="/payroll" className="text-sm text-muted hover:underline">{t("cancel")}</Link>
        </div>
      </form>
    </div>
  );
}
