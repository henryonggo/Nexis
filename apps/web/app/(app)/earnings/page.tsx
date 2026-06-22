import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  listCustomEarnings,
  listEarningGroups,
  type CustomEarningType,
} from "@/lib/earnings";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EarningForm } from "./earning-form";
import { GroupForm } from "./group-form";
import { deleteCustomEarning, deleteEarningGroup } from "./actions";

export default async function EarningsPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/dashboard");

  const supabase = createClient();
  const t = await getTranslations("earnings");
  const [customs, groups] = await Promise.all([
    listCustomEarnings(supabase, active.id),
    listEarningGroups(supabase, active.id),
  ]);
  const activeCustoms = customs.filter((c) => c.active);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <Alert variant="default">{t("intro")}</Alert>

      {/* Custom earning types */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t("custom.heading")}
          </h2>
          <p className="text-xs text-muted">{t("custom.hint")}</p>
        </div>

        {activeCustoms.length > 0 && (
          <Card className="divide-y divide-white/10 p-0">
            {activeCustoms.map((c) => (
              <details key={c.id} className="group p-4">
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                  <span className="text-sm tabular-nums text-muted">{describeCustom(c, t)}</span>
                </summary>
                <div className="mt-4 space-y-4">
                  <EarningForm earning={c} />
                  <form action={deleteCustomEarning}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs font-medium text-danger hover:underline">
                      {t("custom.delete")}
                    </button>
                  </form>
                </div>
              </details>
            ))}
          </Card>
        )}

        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-ink">{t("custom.newHeading")}</p>
          <EarningForm />
        </Card>
      </section>

      {/* Groups */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t("group.heading")}
          </h2>
          <p className="text-xs text-muted">{t("group.hint")}</p>
        </div>

        {groups.length > 0 && (
          <Card className="divide-y divide-white/10 p-0">
            {groups.map((g) => (
              <details key={g.id} className="p-4">
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{g.name}</span>
                  <span className="text-xs text-muted">
                    {t("group.itemCount", { count: g.customTypeIds.length })}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <GroupForm group={g} customs={activeCustoms} />
                  <form action={deleteEarningGroup}>
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="text-xs font-medium text-danger hover:underline">
                      {t("group.delete")}
                    </button>
                  </form>
                </div>
              </details>
            ))}
          </Card>
        )}

        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-ink">{t("group.newHeading")}</p>
          <GroupForm customs={activeCustoms} />
        </Card>
      </section>
    </div>
  );
}

/** Human-readable summary of a custom earning's amount. */
function describeCustom(c: CustomEarningType, t: (key: string) => string): string {
  if (c.calc === "fixed") return formatRupiah(c.amount ?? 0);
  const pct = (c.rateBps ?? 0) / 100;
  const base = c.base === "base_salary" ? t("custom.baseSalary") : t("custom.baseGross");
  return `${pct}% · ${base}`;
}
