import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getCompanyLoans, type LoanView } from "@/lib/loans";
import { LoanStatusBadge } from "./status-badge";
import { LoanDecisionButtons } from "./decision-buttons";
import { LoanRequestForm, type EmployeeOption } from "./request-form";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export default async function LoansPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("loans");
  const canManage =
    active.role === "owner" || active.role === "admin" || active.role === "manager";
  if (!canManage) {
    return (
      <Card className="max-w-lg p-8">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </Card>
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
          <Card className="px-4 py-6 text-center text-sm text-muted">{t("noPending")}</Card>
        ) : (
          <div className="space-y-3">
            {pending.map((l) => (
              <Card key={l.id} className="p-4">
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
              </Card>
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
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.employee")}</TableHead>
            <TableHead className="text-right">{t("columns.principal")}</TableHead>
            <TableHead>{t("columns.installments")}</TableHead>
            <TableHead>{t("columns.next")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted">
                {t("noHistory")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium text-ink">{l.employeeName}</TableCell>
                <TableCell className="text-right tabular-nums text-ink">
                  {formatRupiah(l.principal)}
                </TableCell>
                <TableCell className="text-ink">
                  {l.installments}× {formatRupiah(l.installmentAmount)}
                </TableCell>
                <TableCell className="text-muted">{l.nextDuePeriod ?? "—"}</TableCell>
                <TableCell>
                  <LoanStatusBadge status={l.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
