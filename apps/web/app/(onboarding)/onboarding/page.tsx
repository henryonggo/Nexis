import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // If the user already belongs to a company, skip onboarding.
  const { count } = await supabase
    .from("company_members")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) redirect("/dashboard");

  const t = await getTranslations("onboarding");
  const tc = await getTranslations("common");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold text-brand">{tc("appName")}</div>
        <p className="mt-1 text-sm text-muted">{t("pageSubtitle")}</p>
      </div>
      <OnboardingForm />
      <p className="mt-6 max-w-md text-center text-xs text-muted">{t("footer")}</p>
    </main>
  );
}
