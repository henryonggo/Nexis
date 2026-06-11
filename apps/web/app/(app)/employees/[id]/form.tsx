"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateEmployee, type EditState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import type { EmployeeRow } from "@nexis/types";

const initial: EditState = {};

const PTKP = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

export function EditEmployeeForm({
  canEdit,
  employee,
  baseSalary,
  ptkpStatus,
  npwp,
}: {
  canEdit: boolean;
  employee: EmployeeRow;
  baseSalary: number;
  ptkpStatus: string;
  npwp: string;
}) {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const [state, action] = useFormState(updateEmployee, initial);
  const disabled = !canEdit;

  return (
    <div className="nx-card max-w-xl">
      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success}</div>}
      {!canEdit && (
        <div className="mb-4 rounded-md bg-brand-light px-3 py-2 text-xs text-brand-dark">
          {t("form.viewOnly")}
        </div>
      )}

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={employee.id} />

        <div>
          <label className="nx-label" htmlFor="fullName">{t("form.fullName")}</label>
          <input id="fullName" name="fullName" className="nx-input" defaultValue={employee.full_name} disabled={disabled} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="employeeNo">{t("form.employeeNo")}</label>
            <input id="employeeNo" name="employeeNo" className="nx-input" defaultValue={employee.employee_no ?? ""} disabled={disabled} />
          </div>
          <div>
            <label className="nx-label" htmlFor="status">{t("form.status")}</label>
            <select id="status" name="status" className="nx-input" defaultValue={employee.status} disabled={disabled}>
              <option value="active">{t("status.active")}</option>
              <option value="probation">{t("status.probation")}</option>
              <option value="inactive">{t("status.inactive")}</option>
              <option value="terminated">{t("status.terminated")}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="position">{t("form.position")}</label>
            <input id="position" name="position" className="nx-input" defaultValue={employee.position ?? ""} disabled={disabled} />
          </div>
          <div>
            <label className="nx-label" htmlFor="department">{t("form.department")}</label>
            <input id="department" name="department" className="nx-input" defaultValue={employee.department ?? ""} disabled={disabled} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="employmentType">{t("form.type")}</label>
            <select id="employmentType" name="employmentType" className="nx-input" defaultValue={employee.employment_type} disabled={disabled}>
              <option value="permanent">{t("employmentType.permanent")}</option>
              <option value="contract">{t("employmentType.contract")}</option>
              <option value="intern">{t("employmentType.intern")}</option>
              <option value="daily">{t("employmentType.daily")}</option>
            </select>
          </div>
          <div>
            <label className="nx-label" htmlFor="email">{tc("email")}</label>
            <input id="email" name="email" type="email" className="nx-input" defaultValue={employee.email ?? ""} disabled={disabled} />
          </div>
        </div>

        <hr className="border-[color:var(--border)]" />
        <p className="text-sm font-semibold text-ink">{t("form.payTaxSection")}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="baseSalary">{t("form.baseSalaryEdit")}</label>
            <input id="baseSalary" name="baseSalary" type="number" min={0} step={1000} className="nx-input" defaultValue={baseSalary} disabled={disabled} />
          </div>
          <div>
            <label className="nx-label" htmlFor="ptkpStatus">{t("form.ptkpStatus")}</label>
            <select id="ptkpStatus" name="ptkpStatus" className="nx-input" defaultValue={ptkpStatus} disabled={disabled}>
              {PTKP.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="nx-label" htmlFor="npwp">{t("form.npwp")}</label>
          <input id="npwp" name="npwp" className="nx-input" defaultValue={npwp} disabled={disabled} />
          <p className="mt-1 text-xs text-muted">{t("form.npwpHint")}</p>
        </div>

        {canEdit && <SubmitButton>{t("form.saveChanges")}</SubmitButton>}
      </form>
    </div>
  );
}
