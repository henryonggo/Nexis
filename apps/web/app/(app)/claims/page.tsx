import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getCompanyClaims, getReceiptUrl, type ClaimView } from "@/lib/claims";
import { ClaimStatusBadge } from "./status-badge";
import { ClaimDecisionButtons } from "./decision-buttons";

export default async function ClaimsPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("claims");
  const canApprove =
    active.role === "owner" || active.role === "admin" || active.role === "manager";

  const claims = await getCompanyClaims(supabase, active.id);
  const pending = claims.filter((c) => c.status === "pending");
  const decided = claims.filter((c) => c.status !== "pending");

  const receiptUrls = new Map<string, string>();
  await Promise.all(
    pending
      .filter((c) => c.receiptPath)
      .map(async (c) => {
        const url = await getReceiptUrl(supabase, c.receiptPath!);
        if (url) receiptUrls.set(c.id, url);
      }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("pending", { count: pending.length })}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-[color:var(--border)] bg-white px-4 py-6 text-center text-sm text-muted">
            {t("noPending")}
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[color:var(--border)] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{c.employeeName}</p>
                    <p className="text-sm text-muted">
                      {c.claimTypeName} ·{" "}
                      <span className="font-medium text-ink">{formatRupiah(c.amount)}</span>
                      {c.taxable ? ` · ${t("taxable")}` : ` · ${t("nonTaxable")}`}
                    </p>
                    {c.description && <p className="mt-1 text-sm text-ink">“{c.description}”</p>}
                    {receiptUrls.has(c.id) && (
                      <a
                        href={receiptUrls.get(c.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm text-brand hover:underline"
                      >
                        {t("viewReceipt")}
                      </a>
                    )}
                  </div>
                  {canApprove && <ClaimDecisionButtons claimId={c.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("history")}</h2>
        <HistoryTable rows={decided} />
      </section>
    </div>
  );
}

async function HistoryTable({ rows }: { rows: ClaimView[] }) {
  const t = await getTranslations("claims");
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-light/60 text-left text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">{t("columns.employee")}</th>
            <th className="px-4 py-2 font-medium">{t("columns.type")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("columns.amount")}</th>
            <th className="px-4 py-2 font-medium">{t("columns.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted">
                {t("noHistory")}
              </td>
            </tr>
          ) : (
            rows.map((c) => (
              <tr key={c.id} className="border-t border-[color:var(--border)]">
                <td className="px-4 py-3 font-medium text-ink">{c.employeeName}</td>
                <td className="px-4 py-3 text-ink">{c.claimTypeName}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {formatRupiah(c.amount)}
                </td>
                <td className="px-4 py-3">
                  <ClaimStatusBadge status={c.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
