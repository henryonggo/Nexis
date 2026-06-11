"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { upgradePlan, type BillingActionState } from "./actions";
import type { PlanTier } from "@/lib/billing-plans";
import { PlanCards } from "./plan-cards";
import { SubmitButton } from "@/components/submit-button";

const initial: BillingActionState = {};

export function UpgradeForm({
  defaultEmail,
  currentPlan,
}: {
  defaultEmail: string;
  currentPlan: PlanTier;
}) {
  const t = useTranslations("billing.upgrade");
  const [state, action] = useFormState(upgradePlan, initial);

  return (
    <div className="nx-card max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.ok && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t("success")}
        </div>
      )}

      <form action={action} className="space-y-4">
        <PlanCards currentPlan={currentPlan} />

        <div>
          <label className="nx-label" htmlFor="npwp">
            {t("npwpLabel")}
          </label>
          <input
            id="npwp"
            name="npwp"
            className="nx-input"
            placeholder="99.999.999.9-999.999"
            inputMode="numeric"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="bpjsKes">
              {t("bpjsKesLabel")}
            </label>
            <input id="bpjsKes" name="bpjsKes" className="nx-input" inputMode="numeric" required />
          </div>
          <div>
            <label className="nx-label" htmlFor="bpjsTk">
              {t("bpjsTkLabel")}
            </label>
            <input id="bpjsTk" name="bpjsTk" className="nx-input" inputMode="numeric" required />
          </div>
        </div>

        <div>
          <label className="nx-label" htmlFor="billingEmail">
            {t("billingEmailLabel")}
          </label>
          <input
            id="billingEmail"
            name="billingEmail"
            type="email"
            className="nx-input"
            defaultValue={defaultEmail}
            required
          />
        </div>

        <p className="text-xs text-muted">{t("sandboxNote")}</p>

        <div className="pt-1">
          <SubmitButton>{t("confirm")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
