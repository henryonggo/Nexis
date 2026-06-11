"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createEmployee, type EmployeeState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

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
    <Card className="max-w-xl p-8">
      {state.error && (
        <Alert variant="destructive" className="mb-4">
          {state.error}
          {state.upgrade && (
            <>
              {" "}
              <Link href="/billing" className="font-semibold underline">
                {t("form.upgradeLink")}
              </Link>
            </>
          )}
        </Alert>
      )}
      {state.success && (
        <Alert variant="success" className="mb-4">{state.success} {t("form.redirecting")}</Alert>
      )}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">{t("form.fullName")} *</Label>
          <Input id="fullName" name="fullName" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="employeeNo">{t("form.employeeNo")}</Label>
            <Input id="employeeNo" name="employeeNo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employmentType">{t("form.type")}</Label>
            <select id="employmentType" name="employmentType" className={fieldClasses} defaultValue="permanent">
              <option value="permanent">{t("employmentType.permanent")}</option>
              <option value="contract">{t("employmentType.contract")}</option>
              <option value="intern">{t("employmentType.intern")}</option>
              <option value="daily">{t("employmentType.daily")}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="position">{t("form.position")}</Label>
            <Input id="position" name="position" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department">{t("form.department")}</Label>
            <Input id="department" name="department" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="baseSalary">{t("form.baseSalaryNew")}</Label>
          <Input id="baseSalary" name="baseSalary" type="number" min={0} step={1000} defaultValue={0} />
          <p className="text-xs text-muted">{t("form.baseSalaryHint")}</p>
        </div>
        <SubmitButton>{t("form.save")}</SubmitButton>
      </form>
    </Card>
  );
}
