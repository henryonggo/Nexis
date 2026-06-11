"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setUserLocale } from "@/i18n/actions";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

/** Compact language picker for the top bar. Writes a cookie, then refreshes. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: Locale) {
    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  }

  return (
    <select
      aria-label="Language"
      value={locale}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value as Locale)}
      className="rounded-md border border-[color:var(--border)] bg-white px-2 py-1.5 text-sm text-ink hover:bg-brand-light disabled:opacity-60"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {l === "id" ? "ID" : "EN"} · {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
