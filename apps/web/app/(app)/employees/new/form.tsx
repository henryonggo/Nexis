"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createEmployee, type EmployeeState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { WeekdayPicker } from "@/components/weekday-picker";
import { DEFAULT_WORK_DAYS } from "@/lib/work-schedule";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const initial: EmployeeState = {};

interface NewEmployeeFormProps {
  nextEmployeeNo: number;
}

const PTKP = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

export function NewEmployeeForm({ nextEmployeeNo }: NewEmployeeFormProps) {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const [state, action] = useFormState(createEmployee, initial);
  const router = useRouter();
  const [payFrequency, setPayFrequency] = useState<"monthly" | "daily" | "mixed">("monthly");
  const [customSchedule, setCustomSchedule] = useState(false);
  const [dailyCalcMode, setDailyCalcMode] = useState(true); // true = manual, false = attendance

  const showMonthly = payFrequency === "monthly" || payFrequency === "mixed";
  const showDaily = payFrequency === "daily" || payFrequency === "mixed";

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
            <Input id="employeeNo" name="employeeNo" defaultValue={nextEmployeeNo} />
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
        <Separator />
        <p className="text-sm font-semibold text-ink">{t("form.payTaxSection")}</p>

        <div className="space-y-1.5">
          <Label htmlFor="payFrequency">{t("form.payFrequency")}</Label>
          <select
            id="payFrequency"
            name="payFrequency"
            className={fieldClasses}
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value as "monthly" | "daily" | "mixed")}
          >
            <option value="monthly">{t("form.payMonthly")}</option>
            <option value="daily">{t("form.payDaily")}</option>
            <option value="mixed">{t("form.payMixed")}</option>
          </select>
          <p className="text-xs text-muted">{t(`form.payFrequencyHint.${payFrequency}`)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Monthly base box — shown for monthly & mixed. Kept mounted (hidden)
              for daily so the field always submits a value. */}
          <div className={`space-y-1.5 ${showMonthly ? "" : "hidden"}`}>
            <Label htmlFor="baseSalary">
              {payFrequency === "mixed" ? t("form.monthlyBox") : t("form.baseSalaryNew")}
            </Label>
            <Input id="baseSalary" name="baseSalary" type="number" min={0} step={1000} defaultValue={0} />
            <p className="text-xs text-muted">{t("form.baseSalaryHint")}</p>
          </div>
          {/* Daily rate box — shown for daily & mixed (the second box of "mixed"). */}
          <div className={`space-y-1.5 ${showDaily ? "" : "hidden"}`}>
            <Label htmlFor="dailyRate">{t("form.dailyBox")}</Label>
            <Input id="dailyRate" name="dailyRate" type="number" min={0} step={1000} defaultValue={0} />
            <p className="text-xs text-muted">{t("form.dailyBoxHint")}</p>
          </div>
        </div>

        {showDaily && (
          <div className="space-y-2">
            <Label>{t("form.workScheduleTitle")}</Label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="customSchedule"
                checked={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              {t("form.workScheduleCustom")}
            </label>
            {customSchedule ? (
              <WeekdayPicker name="workDays" defaultSelected={DEFAULT_WORK_DAYS} />
            ) : (
              <p className="text-xs text-muted">{t("form.workScheduleDefaultHint")}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ptkpStatus">{t("form.ptkpStatus")}</Label>
          <select id="ptkpStatus" name="ptkpStatus" className={fieldClasses} defaultValue="TK/0">
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
          <Input id="npwp" name="npwp" />
          <p className="text-xs text-muted">{t("form.npwpHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ktp">{t("form.ktp")}</Label>
          <Input id="ktp" name="ktp" inputMode="numeric" maxLength={16} />
          <p className="text-xs text-muted">{t("form.ktpHint")}</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="dailyCalcMode"
            value="manual"
            checked={dailyCalcMode}
            onChange={(e) => setDailyCalcMode(e.target.checked)}
            defaultChecked
            className="h-4 w-4 accent-brand"
          />
          {t("form.dailyCalcMode")}
        </label>
        <p className="text-xs text-muted">{t("form.dailyCalcModeHint")}</p>

        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("form.phone")}</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="08xxxxxxxxxx" />
        </div>

        <Separator />
        <p className="pt-1 text-sm font-semibold text-ink">{t("form.bankSection")}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bankName">{t("form.bankName")}</Label>
            <Input id="bankName" name="bankName" placeholder="BCA" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountNo">{t("form.accountNo")}</Label>
            <Input id="accountNo" name="accountNo" inputMode="numeric" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountName">{t("form.accountName")}</Label>
          <Input id="accountName" name="accountName" />
        </div>

        <SubmitButton>{t("form.save")}</SubmitButton>
      </form>
    </Card>
  );
}
