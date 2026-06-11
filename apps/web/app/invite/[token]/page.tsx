import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvite } from "./accept";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?redirectTo=/invite/${params.token}`);

  const t = await getTranslations("invite");
  const tc = await getTranslations("common");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold text-brand">{tc("appName")}</div>
        <p className="mt-1 text-sm text-muted">{t("header")}</p>
      </div>
      <div className="nx-card">
        <h1 className="mb-2 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="mb-5 text-sm text-muted">
          {t("signedInPrefix")} <strong>{user.email}</strong>. {t("signedInSuffix")}
        </p>
        <AcceptInvite token={params.token} />
      </div>
    </main>
  );
}
