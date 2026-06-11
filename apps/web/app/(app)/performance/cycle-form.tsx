"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createCycleAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: PerfActionState = {};

/** Create a new review cycle (e.g. "2026 H1"). owner/admin/manager only. */
export function CycleForm() {
  const t = useTranslations("performance.cycleForm");
  const [state, action] = useFormState(createCycleAction, initial);

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
          <label className="nx-label" htmlFor="name">
            {t("name")}
          </label>
          <input id="name" name="name" className="nx-input" placeholder={t("namePlaceholder")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="startDate">
              {t("start")}
            </label>
            <input id="startDate" name="startDate" type="date" className="nx-input" />
          </div>
          <div>
            <label className="nx-label" htmlFor="endDate">
              {t("end")}
            </label>
            <input id="endDate" name="endDate" type="date" className="nx-input" />
          </div>
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </div>
  );
}
