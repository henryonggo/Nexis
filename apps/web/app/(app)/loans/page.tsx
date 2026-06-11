import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getCompanyLoans, type LoanView } from "@/lib/loans";
import { LoanStatusBadge } from "./status-badge";
import { LoanDecisionButtons } from "./decision-buttons";
import { LoanRequestForm, type EmployeeOption } from "./request-form";

export default async function LoansPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("loans");
  const canManage =
    active.role === "owner" || active.role === "admin" || active.role === "manager";
  if (!canManage) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </div>
    );
  }

  const [{ data: empData }, loans] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", active.id)
      .in("status", ["active", "probation"])
      .order("full_name"),
    getCompanyLoans(supabase, active.id),
  ]);

  const employees: EmployeeOption[] = (
    (empData as { id: string; full_name: string }[] | null) ?? []
  ).map((e) => ({ id: e.id, fullName: e.full_name }));

  const pending = loans.filter((l) => l.status === "pending");
  const decided = loans.filter((l) => l.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      <LoanRequestForm employees={employees} />

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
            {pending.map((l) => (
              <div key={l.id} className="rounded-lg border border-[color:var(--border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{l.employeeName}</p>
                    <p className="text-sm text-muted">
                      <span className="font-medium text-ink">{formatRupiah(l.principal)}</span> ·{" "}
                      {l.installments}× {formatRupiah(l.installmentAmount)}{t("perMonth")}
                    </p>
                    {l.reason && <p className="mt-1 text-sm text-ink">“{l.reason}”</p>}
                  </div>
                  <LoanDecisionButtons loanId={l.id} />
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

async function HistoryTable({ rows }: { rows: LoanView[] }) {
  const t = await getTranslations("loans");
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-light/60 text-left text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">{t("columns.employee")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("columns.principal")}</th>
            <th className="px-4 py-2 font-medium">{t("columns.installments")}</th>
            <th className="px-4 py-2 font-medium">{t("columns.next")}</th>
            <th className="px-4 py-2 font-medium">{t("columns.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted">
                {t("noHistory")}
              </td>
            </tr>
          ) : (
            rows.map((l) => (
              <tr key={l.id} className="border-t border-[color:var(--border)]">
                <td className="px-4 py-3 font-medium text-ink">{l.employeeName}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {formatRupiah(l.principal)}
                </td>
                <td className="px-4 py-3 text-ink">
                  {l.installments}× {formatRupiah(l.installmentAmount)}
                </td>
                <td className="px-4 py-3 text-muted">{l.nextDuePeriod ?? "—"}</td>
                <td className="px-4 py-3">
                  <LoanStatusBadge status={l.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
