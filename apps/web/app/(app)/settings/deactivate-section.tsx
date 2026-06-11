"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { deactivateAccount } from "./actions";

/** Two-step confirm before deactivating the account (destructive-ish, reversible). */
export function DeactivateSection() {
  const t = useTranslations("settings.deactivate");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setError(null);
    setPending(true);
    // On success the server action redirects (this component unmounts); we only
    // get here with a result when it failed.
    const res = await deactivateAccount();
    if (res?.error) {
      setError(res.error);
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-4">
      <h2 className="text-sm font-semibold text-red-700">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("description")}</p>

      {error && <div className="nx-error mt-3">{error}</div>}

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? tc("processing") : t("confirm")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm text-muted hover:underline"
          >
            {t("cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          {t("button")}
        </button>
      )}
    </div>
  );
}
