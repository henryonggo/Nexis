import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DeactivateSection } from "./deactivate-section";
import { NotificationsForm } from "./notifications-form";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = await getTranslations("settings");
  const tc = await getTranslations("common");

  // Notification prefs live on the user's profile. `phone` is a real column;
  // `whatsapp_opt_in` is pending (docs/handoff/whatsapp-notifications.md) — read it
  // behind a quarantine cast so the form prefills once the column lands.
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const prefs = profile as ({ phone: string | null; whatsapp_opt_in?: boolean | null }) | null;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("account")}</h2>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <p className="text-sm text-muted">{tc("email")}</p>
          <p className="font-medium text-ink">{user?.email ?? "—"}</p>
        </div>
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("dangerZone")}</h2>
        <DeactivateSection />
      </section>
    </div>
  );
}
