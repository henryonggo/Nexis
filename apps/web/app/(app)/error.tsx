"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * Segment error boundary for every authenticated page. A thrown server-component
 * error (e.g. a failed Supabase query) renders here with a working retry instead
 * of a dead segment, so the browser back button still restores the prior page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // Surface the error in the console for debugging; server logs capture the rest.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {t("retry")}
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light"
        >
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
