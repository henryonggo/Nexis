import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { guardEmployeeAccess } from "@/lib/access";
import { getCompanyClaims, getReceiptUrl, type ClaimView } from "@/lib/claims";
import { ICONS } from "@/lib/nav";
import { ClaimStatusBadge } from "./status-badge";
import { PendingClaimsList } from "./pending-claims-list";
import { ClaimRequestForm } from "./claim-request-form";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export default async function ClaimsPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;
  await guardEmployeeAccess(active.role, active.id, "claims");

  const t = await getTranslations("claims");
  const canApprove =
    active.role === "owner" || active.role === "admin" || active.role === "manager";

  const claims = await getCompanyClaims(supabase, active.id);
  const pending = claims.filter((c) => c.status === "pending");
  const decided = claims.filter((c) => c.status !== "pending");

  // Employees get a self-service view: submit a claim + track their own rows
  // (RLS already scopes `claims` to the signed-in employee).
  if (!canApprove) {
    const { data: claimTypes } = await supabase
      .from("claim_types")
      .select("id, name")
      .eq("company_id", active.id)
      .order("name", { ascending: true });

    return (
      <div className="space-y-6">
        <PageHeader icon={ICONS["claims"]!} title={t("title")} description={t("selfSubtitle")} />
        <ClaimRequestForm claimTypes={(claimTypes as { id: string; name: string }[] | null) ?? []} />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t("myClaims")}
          </h2>
          <HistoryTable rows={claims} />
        </section>
      </div>
    );
  }

  const receiptUrls: Record<string, string> = {};
  await Promise.all(
    pending
      .filter((c) => c.receiptPath)
      .map(async (c) => {
        const url = await getReceiptUrl(supabase, c.receiptPath!);
        if (url) receiptUrls[c.id] = url;
      }),
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={ICONS["claims"]!} title={t("title")} description={t("subtitle", { name: active.name })} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("pending", { count: pending.length })}
        </h2>
        <PendingClaimsList
          pending={pending}
          canApprove={canApprove}
          receiptUrls={receiptUrls}
        />
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
  if (rows.length === 0) {
    return <EmptyState icon={ICONS["claims"]!!} title={t("noHistory")} />;
  }
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.employee")}</TableHead>
            <TableHead>{t("columns.type")}</TableHead>
            <TableHead className="text-right">{t("columns.amount")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium text-ink">{c.employeeName}</TableCell>
              <TableCell className="text-ink">{c.claimTypeName}</TableCell>
              <TableCell className="text-right tabular-nums text-ink">
                {formatRupiah(c.amount)}
              </TableCell>
              <TableCell>
                <ClaimStatusBadge status={c.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
