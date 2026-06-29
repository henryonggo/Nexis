import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  listCustomDeductions,
  listDeductionGroups,
  type CustomDeductionType,
} from "@/lib/deductions";
import { ICONS } from "@/lib/nav";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { IconButton } from "@/components/ui/icon-button";
import { DeductionForm } from "./deduction-form";
import { GroupForm } from "./group-form";
import { deleteCustomDeduction, deleteGroup } from "./actions";

export default async function DeductionsPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/dashboard");

  const supabase = createClient();
  const t = await getTranslations("deductions");
  const [customs, groups] = await Promise.all([
    listCustomDeductions(supabase, active.id),
    listDeductionGroups(supabase, active.id),
  ]);
  const activeCustoms = customs.filter((c) => c.active);

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader icon={ICONS["deductions"]!} title={t("title")} description={t("subtitle")} />

      <Alert variant="default">{t("intro")}</Alert>

      {/* Custom deduction types */}
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
                  <DeductionForm deduction={c} />
                  <form action={deleteCustomDeduction} className="inline-block">
                    <input type="hidden" name="id" value={c.id} />
                    <IconButton
                      icon={<Trash2 className="h-[18px] w-[18px]" />}
                      label={t("custom.delete")}
                      type="submit"
                      variant="ghost"
                      tooltipSide="bottom"
                    />
                  </form>
                </div>
              </details>
            ))}
          </Card>
        )}

        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-ink">{t("custom.newHeading")}</p>
          <DeductionForm />
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
                    {t("group.itemCount", { count: g.statutory.length + g.customTypeIds.length })}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <GroupForm group={g} customs={activeCustoms} />
                  <form action={deleteGroup} className="inline-block">
                    <input type="hidden" name="id" value={g.id} />
                    <IconButton
                      icon={<Trash2 className="h-[18px] w-[18px]" />}
                      label={t("group.delete")}
                      type="submit"
                      variant="ghost"
                      tooltipSide="bottom"
                    />
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

/** Human-readable summary of a custom deduction's amount. */
function describeCustom(c: CustomDeductionType, t: (key: string) => string): string {
  if (c.calc === "fixed") return formatRupiah(c.amount ?? 0);
  const pct = (c.rateBps ?? 0) / 100;
  const base = c.base === "base_salary" ? t("custom.baseSalary") : t("custom.baseGross");
  return `${pct}% · ${base}`;
}
