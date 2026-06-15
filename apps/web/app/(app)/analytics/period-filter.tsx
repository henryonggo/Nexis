"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { fieldClasses } from "@/components/ui/input";

/** Selects the trailing-months window for the trend charts via ?months=. */
export function PeriodFilter({ value }: { value: number }) {
  const t = useTranslations("analytics");
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params);
    next.set("months", e.target.value);
    router.push(`/analytics?${next.toString()}`);
  }

  return (
    <select
      aria-label={t("period.label")}
      value={String(value)}
      onChange={onChange}
      className={`${fieldClasses} h-9 w-auto`}
    >
      <option value="3">{t("period.months", { count: 3 })}</option>
      <option value="6">{t("period.months", { count: 6 })}</option>
      <option value="12">{t("period.months", { count: 12 })}</option>
    </select>
  );
}
