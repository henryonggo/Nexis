"use client";

import { useTranslations } from "next-intl";

/**
 * One-time secret display. The plaintext API key / webhook secret is shown only
 * once (the server stores a hash), so make it obvious and copyable.
 */
export function SecretReveal({ label, secret }: { label: string; secret: string }) {
  const t = useTranslations("developer.secret");
  return (
    <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3">
      <p className="mb-1 text-sm font-semibold text-warning">{label}</p>
      <p className="mb-2 text-xs text-warning">{t("copyNow")}</p>
      <code className="block w-full overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-sm text-ink">
        {secret}
      </code>
    </div>
  );
}
