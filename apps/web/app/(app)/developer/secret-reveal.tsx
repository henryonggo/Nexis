"use client";

import { useTranslations } from "next-intl";

/**
 * One-time secret display. The plaintext API key / webhook secret is shown only
 * once (the server stores a hash), so make it obvious and copyable.
 */
export function SecretReveal({ label, secret }: { label: string; secret: string }) {
  const t = useTranslations("developer.secret");
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="mb-1 text-sm font-semibold text-amber-800">{label}</p>
      <p className="mb-2 text-xs text-amber-700">{t("copyNow")}</p>
      <code className="block w-full overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-sm text-ink">
        {secret}
      </code>
    </div>
  );
}
