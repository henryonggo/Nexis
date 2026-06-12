import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Global 404. Rendered inside the root layout for any unmatched route, so it must
 * stand on its own (no app chrome / sidebar). Mirrors the auth/error visual style.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  const tc = await getTranslations("common");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-lg font-bold text-brand">{tc("appName")}</span>
      <div className="space-y-1">
        <p className="text-5xl font-bold text-ink">404</p>
        <h1 className="text-xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {t("toDashboard")}
        </Link>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light"
        >
          {t("toHome")}
        </Link>
      </div>
    </main>
  );
}
