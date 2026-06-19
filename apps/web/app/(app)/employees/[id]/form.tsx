"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateEmployee, type EditState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import type { EmployeeRow } from "@nexis/types";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const initial: EditState = {};

const PTKP = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

export function EditEmployeeForm({
  canEdit,
  employee,
  baseSalary,
  paymentMethod,
  payFrequency,
  ptkpStatus,
  npwp,
  bankName,
  accountNo,
  accountName,
  coworkers,
}: {
  canEdit: boolean;
  employee: EmployeeRow;
  baseSalary: number;
  paymentMethod: "cash" | "bank";
  payFrequency: "monthly" | "daily";
  ptkpStatus: string;
  npwp: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  coworkers: { id: string; full_name: string }[];
}) {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const [state, action] = useFormState(updateEmployee, initial);
  const disabled = !canEdit;

  return (
    <Card className="max-w-xl p-8">
      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.success && <Alert variant="success" className="mb-4">{state.success}</Alert>}
      {!canEdit && (
        <div className="mb-4 rounded-md bg-brand-light px-3 py-2 text-xs text-brand-dark">
          {t("form.viewOnly")}
        </div>
      )}

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={employee.id} />

        <div className="space-y-1.5">
          <Label htmlFor="fullName">{t("form.fullName")}</Label>
          <Input id="fullName" name="fullName" defaultValue={employee.full_name} disabled={disabled} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="employeeNo">{t("form.employeeNo")}</Label>
            <Input id="employeeNo" name="employeeNo" defaultValue={employee.employee_no ?? ""} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">{t("form.status")}</Label>
            <select id="status" name="status" className={fieldClasses} defaultValue={employee.status} disabled={disabled}>
              <option value="active">{t("status.active")}</option>
              <option value="probation">{t("status.probation")}</option>
              <option value="inactive">{t("status.inactive")}</option>
              <option value="terminated">{t("status.terminated")}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="position">{t("form.position")}</Label>
            <Input id="position" name="position" defaultValue={employee.position ?? ""} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department">{t("form.department")}</Label>
            <Input id="department" name="department" defaultValue={employee.department ?? ""} disabled={disabled} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="employmentType">{t("form.type")}</Label>
            <select id="employmentType" name="employmentType" className={fieldClasses} defaultValue={employee.employment_type} disabled={disabled}>
              <option value="permanent">{t("employmentType.permanent")}</option>
              <option value="contract">{t("employmentType.contract")}</option>
              <option value="intern">{t("employmentType.intern")}</option>
              <option value="daily">{t("employmentType.daily")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{tc("email")}</Label>
            <Input id="email" name="email" type="email" defaultValue={employee.email ?? ""} disabled={disabled} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("form.phone")}</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={employee.phone ?? ""} disabled={disabled} placeholder="08xxxxxxxxxx" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="managerId">{t("form.manager")}</Label>
          <select
            id="managerId"
            name="managerId"
            className={fieldClasses}
            defaultValue={employee.manager_id ?? ""}
            disabled={disabled}
          >
            <option value="">{t("form.managerNone")}</option>
            {coworkers.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <p className="text-xs text-muted">{t("form.managerHint")}</p>
        </div>

        <Separator />
        <p className="text-sm font-semibold text-ink">{t("form.payTaxSection")}</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="payFrequency">{t("form.payFrequency")}</Label>
            <select id="payFrequency" name="payFrequency" className={fieldClasses} defaultValue={payFrequency} disabled={disabled}>
              <option value="monthly">{t("form.payMonthly")}</option>
              <option value="daily">{t("form.payDaily")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baseSalary">{t("form.baseSalaryEdit")}</Label>
            <Input id="baseSalary" name="baseSalary" type="number" min={0} step={1000} defaultValue={baseSalary} disabled={disabled} />
            <p className="text-xs text-muted">{t("form.baseSalaryHint")}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ptkpStatus">{t("form.ptkpStatus")}</Label>
          <select id="ptkpStatus" name="ptkpStatus" className={fieldClasses} defaultValue={ptkpStatus} disabled={disabled}>
            {PTKP.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <details className="rounded-md border border-border bg-bg/40 px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer font-medium text-ink">{t("form.ptkpExplainerTitle")}</summary>
          <p className="mt-2">{t("form.ptkpExplainerBody")}</p>
        </details>

        <div className="space-y-1.5">
          <Label htmlFor="npwp">{t("form.npwp")}</Label>
          <Input id="npwp" name="npwp" defaultValue={npwp} disabled={disabled} />
          <p className="text-xs text-muted">{t("form.npwpHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paymentMethod">{t("form.paymentMethod")}</Label>
          <select id="paymentMethod" name="paymentMethod" className={fieldClasses} defaultValue={paymentMethod} disabled={disabled}>
            <option value="cash">{t("form.paymentCash")}</option>
            <option value="bank">{t("form.paymentBank")}</option>
          </select>
          <p className="text-xs text-muted">{t("form.paymentMethodHint")}</p>
        </div>

        <Separator />
        <p className="text-sm font-semibold text-ink">{t("form.bankSection")}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bankName">{t("form.bankName")}</Label>
            <Input id="bankName" name="bankName" defaultValue={bankName} disabled={disabled} placeholder="BCA" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountNo">{t("form.accountNo")}</Label>
            <Input id="accountNo" name="accountNo" inputMode="numeric" defaultValue={accountNo} disabled={disabled} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountName">{t("form.accountName")}</Label>
          <Input id="accountName" name="accountName" defaultValue={accountName} disabled={disabled} />
        </div>

        {canEdit && <SubmitButton>{t("form.saveChanges")}</SubmitButton>}
      </form>
    </Card>
  );
}
