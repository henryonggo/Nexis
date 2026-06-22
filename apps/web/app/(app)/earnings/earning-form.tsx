"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import {
  createCustomEarning,
  updateCustomEarning,
  type EarningState,
} from "./actions";
import type { CustomEarningType } from "@/lib/earnings";
import { SubmitButton } from "@/components/submit-button";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: EarningState = {};

/** Create (no `earning`) or edit a custom earning (allowance) type. */
export function EarningForm({ earning }: { earning?: CustomEarningType }) {
  const t = useTranslations("earnings");
  const [state, action] = useFormState(
    earning ? updateCustomEarning : createCustomEarning,
    initial,
  );
  const [calc, setCalc] = useState<"fixed" | "percent">(earning?.calc ?? "fixed");
  const suffix = earning?.id ?? "new";

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.ok && <Alert variant="success">{t("saved")}</Alert>}
      {earning && <input type="hidden" name="id" value={earning.id} />}

      <div className="space-y-1.5">
        <Label htmlFor={`name-${suffix}`}>{t("custom.name")}</Label>
        <Input
          id={`name-${suffix}`}
          name="name"
          defaultValue={earning?.name ?? ""}
          required
          placeholder={t("custom.namePlaceholder")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`calc-${suffix}`}>{t("custom.calc")}</Label>
          <select
            id={`calc-${suffix}`}
            name="calc"
            className={fieldClasses}
            value={calc}
            onChange={(e) => setCalc(e.target.value as "fixed" | "percent")}
          >
            <option value="fixed">{t("custom.calcFixed")}</option>
            <option value="percent">{t("custom.calcPercent")}</option>
          </select>
        </div>

        {calc === "fixed" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`amount-${suffix}`}>{t("custom.amount")}</Label>
            <Input
              id={`amount-${suffix}`}
              name="amount"
              type="number"
              min={0}
              step={1000}
              defaultValue={earning?.amount ?? 0}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`rate-${suffix}`}>{t("custom.rate")}</Label>
            <Input
              id={`rate-${suffix}`}
              name="ratePercent"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={earning?.rateBps != null ? earning.rateBps / 100 : 0}
            />
          </div>
        )}
      </div>

      {calc === "percent" && (
        <div className="space-y-1.5">
          <Label htmlFor={`base-${suffix}`}>{t("custom.base")}</Label>
          <select
            id={`base-${suffix}`}
            name="base"
            className={fieldClasses}
            defaultValue={earning?.base ?? "base_salary"}
          >
            <option value="base_salary">{t("custom.baseSalary")}</option>
            <option value="gross">{t("custom.baseGross")}</option>
          </select>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="taxable"
          defaultChecked={earning?.taxable ?? true}
          className="h-4 w-4 accent-brand"
        />
        {t("custom.taxable")}
      </label>
      <p className="text-xs text-muted">{t("custom.taxableHint")}</p>

      <SubmitButton>{earning ? t("custom.save") : t("custom.create")}</SubmitButton>
    </form>
  );
}
