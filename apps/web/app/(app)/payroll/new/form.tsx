"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createDraftRun, type RunActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

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
    <Card className="max-w-lg p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="month">{t("month")}</Label>
            <select id="month" name="month" defaultValue={defaultMonth} className={fieldClasses}>
              {months.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year">{t("year")}</Label>
            <select id="year" name="year" defaultValue={defaultYear} className={fieldClasses}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="runType">{t("runType")}</Label>
          <select id="runType" name="runType" defaultValue="monthly" className={fieldClasses}>
            <option value="monthly">{t("monthly")}</option>
            <option value="thr">{t("thr")}</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <SubmitButton>{t("submit")}</SubmitButton>
          <Link href="/payroll" className="text-sm text-muted hover:underline">{t("cancel")}</Link>
        </div>
      </form>
    </Card>
  );
}
