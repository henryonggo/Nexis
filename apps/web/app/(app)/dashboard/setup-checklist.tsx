import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";

/**
 * Post-create onboarding nudge (P1-1). State is derived live from DB facts passed
 * in — no stored progress column. Renders nothing once every step is done.
 */
export async function SetupChecklist({
  hasEmployees,
  hasShifts,
  hasPayroll,
}: {
  hasEmployees: boolean;
  hasShifts: boolean;
  hasPayroll: boolean;
}) {
  if (hasEmployees && hasShifts && hasPayroll) return null;

  const t = await getTranslations("dashboard.checklist");
  const steps = [
    { done: true, label: t("company"), href: null as string | null },
    { done: hasEmployees, label: t("employees"), href: "/employees/new" },
    { done: hasShifts, label: t("shifts"), href: "/attendance/config" },
    { done: hasPayroll, label: t("payroll"), href: "/payroll/new" },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t("title")}</h2>
        <span className="text-xs text-muted">
          {t("progress", { done: completed, total: steps.length })}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                s.done ? "bg-success text-white" : "border border-border text-muted"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            {s.done || !s.href ? (
              <span className={s.done ? "text-muted line-through" : "text-ink"}>{s.label}</span>
            ) : (
              <Link href={s.href} className="font-medium text-brand hover:underline">
                {s.label} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
