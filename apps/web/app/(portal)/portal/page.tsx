import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { Building2, Users, AlertTriangle, Wallet } from "lucide-react";
import { getPortalCompanies } from "@/lib/portal";
import { Card } from "@/components/ui/card";
import { PortalGrid } from "./portal-grid";

/** Current time in Asia/Jakarta (WIB), HH:mm — for the "as of" stamp. */
function nowWibHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone = "brand",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "brand" | "warning";
}) {
  const ring = tone === "warning" ? "bg-warning/10 text-warning" : "bg-brand-light text-brand";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-muted">{label}</div>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${ring}`}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </Card>
  );
}

export default async function PortalPage() {
  const { companies, rollup } = await getPortalCompanies();

  // The portal only makes sense for multi-company users. No companies → onboard;
  // a single company → the normal dashboard already covers it.
  if (rollup.totalCompanies === 0) redirect("/onboarding");
  if (rollup.totalCompanies === 1) redirect("/dashboard");

  const t = await getTranslations("portal");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <span className="text-xs text-muted">{t("asOf", { time: nowWibHm() })}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={<Building2 className="h-5 w-5" />}
          label={t("kpi.companies")}
          value={String(rollup.totalCompanies)}
          hint={t("companyCount", { count: rollup.totalCompanies })}
        />
        <KpiTile
          icon={<Users className="h-5 w-5" />}
          label={t("kpi.employees")}
          value={String(rollup.totalHeadcount)}
          hint={t("kpi.employees")}
        />
        <KpiTile
          icon={<AlertTriangle className="h-5 w-5" />}
          label={t("kpi.needsAction")}
          value={String(rollup.companiesNeedingAction)}
          hint={t("kpi.needsActionHint", { count: rollup.companiesNeedingAction })}
          tone="warning"
        />
        <KpiTile
          icon={<Wallet className="h-5 w-5" />}
          label={t("kpi.payrollTotal")}
          value={formatRupiah(rollup.totalLastPayrollNet)}
          hint={t("kpi.payrollTotalHint")}
        />
      </div>

      <PortalGrid companies={companies} />
    </div>
  );
}
