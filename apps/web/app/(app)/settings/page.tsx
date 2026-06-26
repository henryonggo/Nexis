import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { normalizeWorkDays } from "@/lib/work-schedule";
import { DeactivateSection } from "./deactivate-section";
import { NotificationsForm } from "./notifications-form";
import { PayrollSettingsForm } from "./payroll-settings-form";
import { ThemeSettingsForm } from "./theme-settings-form";
import { Card } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = await getTranslations("settings");
  const tc = await getTranslations("common");

  // Notification prefs live on the user's profile.
  const { data: prefs } = await supabase
    .from("profiles")
    .select("phone, whatsapp_opt_in")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  // Company-level payroll settings (owner/admin only).
  const active = await getActiveCompany();
  const canManageCompany = active?.role === "owner" || active?.role === "admin";
  const { data: companySettings } = canManageCompany
    ? await supabase
        .from("company_settings")
        .select("workweek_days, work_days")
        .eq("company_id", active!.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("account")}</h2>
        <Card className="p-4">
          <p className="text-sm text-muted">{tc("email")}</p>
          <p className="font-medium text-ink">{user?.email ?? "—"}</p>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("appearance.heading")}
        </h2>
        <ThemeSettingsForm />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("notifications.heading")}
        </h2>
        <NotificationsForm
          defaultPhone={prefs?.phone ?? ""}
          defaultOptIn={prefs?.whatsapp_opt_in ?? false}
        />
      </section>

      {canManageCompany && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t("payroll.heading")}
          </h2>
          <PayrollSettingsForm
            workweekDays={companySettings?.workweek_days ?? 5}
            workDays={normalizeWorkDays(companySettings?.work_days)}
          />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("dangerZone")}</h2>
        <DeactivateSection />
      </section>
    </div>
  );
}
