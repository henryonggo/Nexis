"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createGoalAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

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
      <div className="nx-card">
        <h2 className="mb-1 text-lg font-semibold text-ink">{t("titleEmpty")}</h2>
        <p className="text-sm text-muted">{t("emptyHint")}</p>
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
        <input type="hidden" name="cycleId" value={cycleId} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="goal-employee">
              {t("employee")}
            </label>
            <select
              id="goal-employee"
              name="employeeId"
              className="nx-input"
              defaultValue={employees[0]!.id}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="nx-label" htmlFor="weight">
              {t("weight")}
            </label>
            <input
              id="weight"
              name="weight"
              type="number"
              min={0}
              max={100}
              defaultValue={20}
              className="nx-input"
            />
          </div>
        </div>
        <div>
          <label className="nx-label" htmlFor="title">
            {t("goal")}
          </label>
          <input
            id="title"
            name="title"
            className="nx-input"
            placeholder={t("goalPlaceholder")}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="description">
            {t("description")}
          </label>
          <input id="description" name="description" className="nx-input" />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </div>
  );
}
