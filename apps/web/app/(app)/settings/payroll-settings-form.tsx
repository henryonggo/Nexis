"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updatePayrollSettings, type PayrollSettingsState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { WeekdayPicker } from "@/components/weekday-picker";
import { Card } from "@/components/ui/card";
import { fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: PayrollSettingsState = {};

/** Company-level working-days settings used to scale daily & mixed salaries. */
export function PayrollSettingsForm({
  workweekDays,
  workDays,
}: {
  workweekDays: number;
  workDays: number[];
}) {
  const t = useTranslations("settings");
  const [state, action] = useFormState(updatePayrollSettings, initial);

  return (
    <Card className="p-4">
      <form action={action} className="space-y-4">
        {state.error && <Alert variant="destructive">{state.error}</Alert>}
        {state.ok && <Alert variant="success">{t("payroll.saved")}</Alert>}

        <div className="space-y-1.5">
          <Label>{t("payroll.workDays")}</Label>
          <WeekdayPicker defaultSelected={workDays} />
          <p className="text-xs text-muted">{t("payroll.workDaysHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="workweekDays">{t("payroll.workweekDays")}</Label>
          <select
            id="workweekDays"
            name="workweekDays"
            className={fieldClasses}
            defaultValue={workweekDays}
          >
            <option value={5}>{t("payroll.workweek5")}</option>
            <option value={6}>{t("payroll.workweek6")}</option>
          </select>
          <p className="text-xs text-muted">{t("payroll.workweekHint")}</p>
        </div>

        <SubmitButton>{t("payroll.save")}</SubmitButton>
      </form>
    </Card>
  );
}
