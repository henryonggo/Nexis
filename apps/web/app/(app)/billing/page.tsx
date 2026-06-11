import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getBilling,
  getInvoices,
  planMeta,
  estimateMonthlyCost,
  formatNpwp,
  formatRupiah,
} from "@/lib/billing";
import { UpgradeForm } from "./upgrade-form";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function BillingPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("billing");
  const tPlans = await getTranslations("plans");
  const tDetails = await getTranslations("planDetails");

  const isAdmin = active.role === "owner" || active.role === "admin";
  const isOwner = active.role === "owner";
  if (!isAdmin) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("adminOnly")}</p>
      </div>
    );
  }

  const [{ data: { user } }, billing, invoices] = await Promise.all([
    supabase.auth.getUser(),
    getBilling(supabase, active.id),
    getInvoices(supabase, active.id),
  ]);

  const plan = planMeta(billing?.plan ?? "free");
  const seats = billing?.active_seats ?? 0;
  const seatCap = plan.seatCap;
  const monthlyCost = estimateMonthlyCost(plan, seats);
  const atLimit = seatCap != null && seats >= seatCap;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      {/* Current plan summary */}
      <div className="nx-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{t("currentPlan")}</p>
            <p className="text-2xl font-bold text-ink">{tPlans(plan.id)}</p>
            <p className="mt-1 max-w-md text-sm text-muted">{tDetails(`${plan.id}.description`)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">{t("activeSeats")}</p>
            <p className="text-2xl font-bold tabular-nums text-ink">
              {seats}
              {seatCap != null && <span className="text-base text-muted"> / {seatCap}</span>}
            </p>
            {monthlyCost != null && monthlyCost > 0 && (
              <p className="mt-1 text-sm text-muted">
                {t("monthlyEst", { amount: formatRupiah(monthlyCost) })}
              </p>
            )}
          </div>
        </div>

        {atLimit && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("atLimit")} {isOwner ? t("atLimitOwner") : t("atLimitNonOwner")}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-[color:var(--border)] pt-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("npwp")}</dt>
            <dd className="font-medium text-ink">{formatNpwp(billing?.npwp ?? null)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("billingEmail")}</dt>
            <dd className="font-medium text-ink">{billing?.billing_email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("bpjsKes")}</dt>
            <dd className="font-medium text-ink">{billing?.bpjs_kes_no ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("bpjsTk")}</dt>
            <dd className="font-medium text-ink">{billing?.bpjs_tk_no ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Upgrade (owner only) */}
      {isOwner ? (
        <UpgradeForm defaultEmail={billing?.billing_email ?? user?.email ?? ""} currentPlan={plan.id} />
      ) : (
        <div className="nx-card max-w-xl">
          <p className="text-sm text-muted">{t("ownerOnlyUpgrade")}</p>
        </div>
      )}

      {/* Invoices */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("invoices")}</h2>
        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-light/60 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t("invoiceColumns.date")}</th>
                <th className="px-4 py-2 font-medium">{t("invoiceColumns.period")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("invoiceColumns.amount")}</th>
                <th className="px-4 py-2 font-medium">{t("invoiceColumns.status")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    {t("noInvoices")}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-[color:var(--border)]">
                    <td className="px-4 py-3 text-muted">
                      {DATE_FMT.format(new Date(inv.created_at))}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {inv.period_start && inv.period_end
                        ? `${DATE_FMT.format(new Date(inv.period_start))} – ${DATE_FMT.format(new Date(inv.period_end))}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatRupiah(inv.amount)}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {t(`invoiceStatus.${inv.status}`)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.pdf_url ? (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline"
                        >
                          {t("viewPdf")}
                        </a>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
