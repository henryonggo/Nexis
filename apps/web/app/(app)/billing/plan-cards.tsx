"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PLANS, formatRupiah, type PlanTier } from "@/lib/billing-plans";

/**
 * Plan-comparison grid for the upgrade form. Paid, non-current plans are selectable
 * radio cards; the active plan shows a "current" badge; Enterprise is a contact card.
 * The chosen plan is written to a hidden `plan` field consumed by the upgrade action.
 */
export function PlanCards({ currentPlan }: { currentPlan: PlanTier }) {
  const t = useTranslations("billing.cards");
  const tPlans = useTranslations("plans");
  const tDetails = useTranslations("planDetails");
  const selectable = PLANS.filter(
    (p) => p.id !== "free" && p.id !== "enterprise" && p.id !== currentPlan,
  );
  const [selected, setSelected] = useState<PlanTier | null>(selectable[0]?.id ?? null);

  return (
    <div>
      <input type="hidden" name="plan" value={selected ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isContact = plan.id === "enterprise";
          const isSelectable = !isCurrent && !isContact && plan.id !== "free";
          const isSelected = selected === plan.id;

          return (
            <div
              key={plan.id}
              role={isSelectable ? "radio" : undefined}
              aria-checked={isSelectable ? isSelected : undefined}
              tabIndex={isSelectable ? 0 : undefined}
              onClick={isSelectable ? () => setSelected(plan.id) : undefined}
              onKeyDown={
                isSelectable
                  ? (e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setSelected(plan.id);
                      }
                    }
                  : undefined
              }
              className={`flex flex-col rounded-lg border p-4 transition ${
                isSelected
                  ? "border-brand ring-1 ring-brand"
                  : "border-[color:var(--border)]"
              } ${isSelectable ? "cursor-pointer hover:border-brand" : ""} ${
                isCurrent ? "bg-brand-light/40" : "bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{tPlans(plan.id)}</span>
                {isCurrent && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
                    {t("current")}
                  </span>
                )}
                {isSelected && !isCurrent && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
                    {t("selected")}
                  </span>
                )}
              </div>

              <div className="mt-2">
                {plan.pricePerSeat == null ? (
                  <span className="text-lg font-bold text-ink">{t("contactPrice")}</span>
                ) : plan.pricePerSeat === 0 ? (
                  <span className="text-lg font-bold text-ink">{t("free")}</span>
                ) : (
                  <>
                    <span className="text-lg font-bold text-ink">
                      {formatRupiah(plan.pricePerSeat)}
                    </span>
                    <span className="text-xs text-muted"> {t("perSeat")}</span>
                  </>
                )}
              </div>

              <ul className="mt-3 space-y-1.5 text-xs text-muted">
                {(tDetails.raw(`${plan.id}.features`) as string[]).map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span aria-hidden className="text-accent">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isContact && (
                <a
                  href="mailto:sales@nexishr.com?subject=Nexis%20Enterprise"
                  className="mt-3 text-xs font-semibold text-brand hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("contactSales")}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
