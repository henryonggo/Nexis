"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createGoalAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: PerfActionState = {};

export interface EmployeeOption {
  id: string;
  fullName: string;
}

/** Add a weighted KPI/goal for an employee in the selected cycle. */
export function GoalForm({
  employees,
  cycleId,
}: {
  employees: EmployeeOption[];
  cycleId: string;
}) {
  const t = useTranslations("performance.goalForm");
  const [state, action] = useFormState(createGoalAction, initial);

  if (employees.length === 0) {
    return (
      <Card className="p-8">
        <h2 className="mb-1 text-lg font-semibold text-ink">{t("titleEmpty")}</h2>
        <p className="text-sm text-muted">{t("emptyHint")}</p>
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
        <input type="hidden" name="cycleId" value={cycleId} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="goal-employee">{t("employee")}</Label>
            <select
              id="goal-employee"
              name="employeeId"
              className={fieldClasses}
              defaultValue={employees[0]!.id}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weight">{t("weight")}</Label>
            <Input id="weight" name="weight" type="number" min={0} max={100} defaultValue={20} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">{t("goal")}</Label>
          <Input id="title" name="title" placeholder={t("goalPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">{t("description")}</Label>
          <Input id="description" name="description" />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
