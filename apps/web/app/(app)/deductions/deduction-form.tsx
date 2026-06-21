"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import {
  createCustomDeduction,
  updateCustomDeduction,
  type DeductionState,
} from "./actions";
import type { CustomDeductionType } from "@/lib/deductions";
import { SubmitButton } from "@/components/submit-button";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: DeductionState = {};

/** Create (no `deduction`) or edit a custom deduction type. */
export function DeductionForm({ deduction }: { deduction?: CustomDeductionType }) {
  const t = useTranslations("deductions");
  const [state, action] = useFormState(
    deduction ? updateCustomDeduction : createCustomDeduction,
    initial,
  );
  const [calc, setCalc] = useState<"fixed" | "percent">(deduction?.calc ?? "fixed");

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.ok && <Alert variant="success">{t("saved")}</Alert>}
      {deduction && <input type="hidden" name="id" value={deduction.id} />}

      <div className="space-y-1.5">
        <Label htmlFor={`name-${deduction?.id ?? "new"}`}>{t("custom.name")}</Label>
        <Input
          id={`name-${deduction?.id ?? "new"}`}
          name="name"
          defaultValue={deduction?.name ?? ""}
          required
          placeholder={t("custom.namePlaceholder")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`calc-${deduction?.id ?? "new"}`}>{t("custom.calc")}</Label>
          <select
            id={`calc-${deduction?.id ?? "new"}`}
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
            <Label htmlFor={`amount-${deduction?.id ?? "new"}`}>{t("custom.amount")}</Label>
            <Input
              id={`amount-${deduction?.id ?? "new"}`}
              name="amount"
              type="number"
              min={0}
              step={1000}
              defaultValue={deduction?.amount ?? 0}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`rate-${deduction?.id ?? "new"}`}>{t("custom.rate")}</Label>
            <Input
              id={`rate-${deduction?.id ?? "new"}`}
              name="ratePercent"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={deduction?.rateBps != null ? deduction.rateBps / 100 : 0}
            />
          </div>
        )}
      </div>

      {calc === "percent" && (
        <div className="space-y-1.5">
          <Label htmlFor={`base-${deduction?.id ?? "new"}`}>{t("custom.base")}</Label>
          <select
            id={`base-${deduction?.id ?? "new"}`}
            name="base"
            className={fieldClasses}
            defaultValue={deduction?.base ?? "gross"}
          >
            <option value="gross">{t("custom.baseGross")}</option>
            <option value="base_salary">{t("custom.baseSalary")}</option>
          </select>
        </div>
      )}

      <SubmitButton>{deduction ? t("custom.save") : t("custom.create")}</SubmitButton>
    </form>
  );
}
