"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createEmployee, type EmployeeState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: EmployeeState = {};

export function NewEmployeeForm() {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const [state, action] = useFormState(createEmployee, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      const t = setTimeout(() => router.push("/employees"), 600);
      return () => clearTimeout(t);
    }
  }, [state.success, router]);

  return (
    <div className="nx-card max-w-xl">
      {state.error && (
        <div className="nx-error mb-4">
          {state.error}
          {state.upgrade && (
            <>
              {" "}
              <Link href="/billing" className="font-semibold underline">
                {t("form.upgradeLink")}
              </Link>
            </>
          )}
        </div>
      )}
      {state.success && (
        <div className="nx-success mb-4">{state.success} {t("form.redirecting")}</div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="fullName">{t("form.fullName")} *</label>
          <input id="fullName" name="fullName" className="nx-input" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="employeeNo">{t("form.employeeNo")}</label>
            <input id="employeeNo" name="employeeNo" className="nx-input" />
          </div>
          <div>
            <label className="nx-label" htmlFor="employmentType">{t("form.type")}</label>
            <select id="employmentType" name="employmentType" className="nx-input" defaultValue="permanent">
              <option value="permanent">{t("employmentType.permanent")}</option>
              <option value="contract">{t("employmentType.contract")}</option>
              <option value="intern">{t("employmentType.intern")}</option>
              <option value="daily">{t("employmentType.daily")}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="position">{t("form.position")}</label>
            <input id="position" name="position" className="nx-input" />
          </div>
          <div>
            <label className="nx-label" htmlFor="department">{t("form.department")}</label>
            <input id="department" name="department" className="nx-input" />
          </div>
        </div>
        <div>
          <label className="nx-label" htmlFor="email">{tc("email")}</label>
          <input id="email" name="email" type="email" className="nx-input" />
        </div>
        <div>
          <label className="nx-label" htmlFor="baseSalary">{t("form.baseSalaryNew")}</label>
          <input id="baseSalary" name="baseSalary" type="number" min={0} step={1000} className="nx-input" defaultValue={0} />
          <p className="mt-1 text-xs text-muted">{t("form.baseSalaryHint")}</p>
        </div>
        <SubmitButton>{t("form.save")}</SubmitButton>
      </form>
    </div>
  );
}
