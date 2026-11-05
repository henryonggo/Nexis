import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";

/**
 * Getting-started nudge. State is derived live from DB facts passed in — no
 * stored progress column. Renders nothing once every step is done.
 */
export async function SetupChecklist({
  hasEmployees,
  hasReadyData,
  incompleteCount,
  hasPayroll,
}: {
  hasEmployees: boolean;
  hasReadyData: boolean;
  incompleteCount: number;
  hasPayroll: boolean;
}) {
  if (hasEmployees && hasReadyData && hasPayroll) return null;

  const t = await getTranslations("dashboard.checklist");
  const steps = [
    { done: true, label: t("company"), href: null as string | null, hint: null as string | null },
    { done: hasEmployees, label: t("employees"), href: "/employees/new", hint: null },
    {
      done: hasReadyData,
      label: t("readyData"),
      // /employees shows each employee's missing items next to their name.
      href: "/employees",
      hint: incompleteCount > 0 ? t("incomplete", { count: incompleteCount }) : null,
    },
    { done: hasPayroll, label: t("payroll"), href: "/approvals", hint: null },
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
            {!s.done && s.hint && <span className="text-xs text-muted">· {s.hint}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
