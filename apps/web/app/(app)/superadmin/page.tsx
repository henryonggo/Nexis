import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperadmin } from "@/lib/superadmin";
import { planMeta } from "@/lib/billing-plans";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FreePassButton } from "./free-pass-button";

interface CompanyListRow {
  id: string;
  name: string;
  plan: string;
  activeSeats: number;
  comped: boolean;
}

export default async function SuperadminPage() {
  // Hard gate: only the platform superadmin allowlist reaches this surface.
  const admin = await getSuperadmin();
  if (!admin) notFound();

  const t = await getTranslations("superadmin");
  const configured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  let companies: CompanyListRow[] = [];
  if (configured) {
    // Service-role read: a superadmin is not a member of these companies, so RLS
    // would hide them. The allowlist gate above is the authorization boundary.
    const supabase = createAdminClient();
    const [{ data: comps }, { data: billing }] = await Promise.all([
      supabase.from("companies").select("id, name").order("name", { ascending: true }),
      supabase.from("company_billing").select("company_id, plan, active_seats"),
    ]);
    const billingByCompany = new Map(
      ((billing as { company_id: string; plan: string; active_seats: number }[] | null) ?? []).map(
        (b) => [b.company_id, b],
      ),
    );
    companies = ((comps as { id: string; name: string }[] | null) ?? []).map((c) => {
      const b = billingByCompany.get(c.id);
      const plan = b?.plan ?? "free";
      return {
        id: c.id,
        name: c.name,
        plan,
        activeSeats: b?.active_seats ?? 0,
        // A comped company is one on the enterprise plan (our free-pass representation).
        comped: plan === "enterprise",
      };
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <Alert variant="default">{t("intro")}</Alert>

      {!configured ? (
        <Alert variant="warning">{t("notConfigured")}</Alert>
      ) : companies.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <Card className="divide-y divide-white/10 p-0">
          {companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                <p className="text-xs text-muted">
                  {c.comped ? (
                    <span className="font-medium text-success">{t("statusComped")}</span>
                  ) : (
                    t("planLabel", { plan: planMeta(c.plan as never).label })
                  )}{" "}
                  · {t("seats", { count: c.activeSeats })}
                </p>
              </div>
              <div className="w-40 shrink-0">
                <FreePassButton companyId={c.id} comped={c.comped} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
