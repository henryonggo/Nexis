"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { requestLoanAction, type LoanActionState } from "./actions";
import { formatRupiah } from "@nexis/money";
import { SubmitButton } from "@/components/submit-button";

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
        <div>
          <label className="nx-label" htmlFor="employeeId">
            {t("employee")}
          </label>
          <select id="employeeId" name="employeeId" className="nx-input" defaultValue={employees[0]!.id}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="principal">
              {t("amount")}
            </label>
            <input
              id="principal"
              name="principal"
              type="number"
              min={0}
              step={50000}
              className="nx-input"
              defaultValue={0}
              onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="installments">
              {t("installments")}
            </label>
            <input
              id="installments"
              name="installments"
              type="number"
              min={1}
              max={60}
              className="nx-input"
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

        <div>
          <label className="nx-label" htmlFor="reason">
            {t("reason")}
          </label>
          <input id="reason" name="reason" className="nx-input" placeholder={t("reasonPlaceholder")} />
        </div>

        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </div>
  );
}
