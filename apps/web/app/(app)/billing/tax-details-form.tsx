"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateBillingDetails, type BillingActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: BillingActionState = {};

export function TaxDetailsForm({
  npwp,
  bpjsKes,
  bpjsTk,
  billingEmail,
}: {
  npwp: string;
  bpjsKes: string;
  bpjsTk: string;
  billingEmail: string;
}) {
  const t = useTranslations("billing.taxDetails");
  const [state, action] = useFormState(updateBillingDetails, initial);

  return (
    <Card className="max-w-3xl p-8">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.ok && <Alert variant="success" className="mb-4">{t("success")}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="td-npwp">{t("npwpLabel")} *</Label>
          <Input
            id="td-npwp"
            name="npwp"
            defaultValue={npwp}
            placeholder="99.999.999.9-999.999"
            inputMode="numeric"
            required
          />
          <p className="text-xs text-muted">{t("npwpHint")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="td-bpjsKes">{t("bpjsKesLabel")} *</Label>
            <Input id="td-bpjsKes" name="bpjsKes" defaultValue={bpjsKes} inputMode="numeric" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="td-bpjsTk">{t("bpjsTkLabel")} *</Label>
            <Input id="td-bpjsTk" name="bpjsTk" defaultValue={bpjsTk} inputMode="numeric" required />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="td-billingEmail">{t("billingEmailLabel")} *</Label>
          <Input
            id="td-billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={billingEmail}
            required
          />
        </div>

        <div className="pt-1">
          <SubmitButton>{t("save")}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
