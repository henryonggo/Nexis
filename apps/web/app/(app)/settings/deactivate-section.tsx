"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { deactivateAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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

      {error && <Alert variant="destructive" className="mt-3">{error}</Alert>}

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? tc("processing") : t("confirm")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(true)}
          className="mt-3 border-danger/40 text-danger hover:bg-danger/5 hover:text-danger"
        >
          {t("button")}
        </Button>
      )}
    </div>
  );
}
