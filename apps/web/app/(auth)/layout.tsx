import { getTranslations } from "next-intl/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold text-brand">{t("appName")}</div>
        <p className="mt-1 text-sm text-muted">{t("tagline")}</p>
      </div>
      {children}
      <p className="mt-6 text-center text-xs text-muted">{t("freeFooter")}</p>
    </main>
  );
}
