"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { upgradePlan, type BillingActionState } from "./actions";
import type { PlanTier } from "@/lib/billing-plans";
import { PlanCards } from "./plan-cards";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

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
    <Card className="max-w-3xl p-8">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.ok && <Alert variant="success" className="mb-4">{t("success")}</Alert>}

      <form action={action} className="space-y-4">
        <PlanCards currentPlan={currentPlan} />

        <div className="space-y-1.5">
          <Label htmlFor="npwp">{t("npwpLabel")}</Label>
          <Input
            id="npwp"
            name="npwp"
            placeholder="99.999.999.9-999.999"
            inputMode="numeric"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bpjsKes">{t("bpjsKesLabel")}</Label>
            <Input id="bpjsKes" name="bpjsKes" inputMode="numeric" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bpjsTk">{t("bpjsTkLabel")}</Label>
            <Input id="bpjsTk" name="bpjsTk" inputMode="numeric" required />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="billingEmail">{t("billingEmailLabel")}</Label>
          <Input
            id="billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={defaultEmail}
            required
          />
        </div>

        <p className="text-xs text-muted">{t("sandboxNote")}</p>

        <div className="pt-1">
          <SubmitButton>{t("confirm")}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
