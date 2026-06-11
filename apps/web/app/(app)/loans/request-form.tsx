"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { requestLoanAction, type LoanActionState } from "./actions";
import { formatRupiah } from "@nexis/money";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: LoanActionState = {};

export interface EmployeeOption {
  id: string;
  fullName: string;
}

export function LoanRequestForm({ employees }: { employees: EmployeeOption[] }) {
  const t = useTranslations("loans.form");
  const [state, action] = useFormState(requestLoanAction, initial);
  const [principal, setPrincipal] = useState(0);
  const [installments, setInstallments] = useState(1);

  const perInstallment = installments > 0 ? Math.round(principal / installments) : 0;

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
        <div className="space-y-1.5">
          <Label htmlFor="employeeId">{t("employee")}</Label>
          <select id="employeeId" name="employeeId" className={fieldClasses} defaultValue={employees[0]!.id}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="principal">{t("amount")}</Label>
            <Input
              id="principal"
              name="principal"
              type="number"
              min={0}
              step={50000}
              defaultValue={0}
              onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="installments">{t("installments")}</Label>
            <Input
              id="installments"
              name="installments"
              type="number"
              min={1}
              max={60}
              defaultValue={1}
              onChange={(e) => setInstallments(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        {principal > 0 && installments > 0 && (
          <p className="text-sm text-muted">
            {t("estimatePrefix")}{" "}
            <span className="font-medium text-ink">{formatRupiah(perInstallment)}</span>{" "}
            {t("estimateSuffix", { count: installments })}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="reason">{t("reason")}</Label>
          <Input id="reason" name="reason" placeholder={t("reasonPlaceholder")} />
        </div>

        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
