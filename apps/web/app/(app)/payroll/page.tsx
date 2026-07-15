import Link from "next/link";
import { Plus, Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Database } from "@nexis/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/roles";
import { formatPeriod, formatRupiah } from "@/lib/payroll";
import { ICONS } from "@/lib/nav";
import { ExportCsvButton } from "@/components/export-csv-button";
import { StatusBadge } from "./status-badge";
import { PageHeader } from "@/components/page-header";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

type RunRow = Pick<
  Database["public"]["Tables"]["payroll_runs"]["Row"],
  "id" | "period_year" | "period_month" | "status" | "total_gross" | "total_net" | "created_at"
>;

export default async function PayrollPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const isAdmin = isAdminRole(active.role);
  const t = await getTranslations("payroll");

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, period_year, period_month, status, total_gross, total_net, created_at")
    .eq("company_id", active.id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const rows = (runs as RunRow[] | null) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ICONS.payroll}
        title={t("title")}
        description={t("subtitle", { name: active.name })}
        actions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              filename={`payroll-${active.name}`}
              headers={["Periode", "Status", "Bruto", "Neto"]}
              rows={rows.map((run) => [
                formatPeriod(run.period_year, run.period_month),
                run.status,
                run.total_gross,
                run.total_net,
              ])}
            />
            {isAdmin && (
              <Button asChild>
                <Link href="/payroll/new"><Plus className="w-4 h-4 mr-2" />{t("runPayroll")}</Link>
              </Button>
            )}
          </div>
        }
      />

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.period")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">{t("columns.gross")}</TableHead>
              <TableHead className="text-right">{t("columns.net")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted">
                  {t("empty")}{" "}
                  {isAdmin && (
                    <Link href="/payroll/new" className="font-medium text-brand hover:underline">
                      {t("runFirst")}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium text-ink">
                    <Link href={`/payroll/${run.id}`} className="hover:underline">
                      {formatPeriod(run.period_year, run.period_month)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-ink">
                    {formatRupiah(run.total_gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-ink">
                    {formatRupiah(run.total_net)}
                  </TableCell>
                  <TableCell className="text-right">
                    <IconButton icon={<Eye className="h-[18px] w-[18px]" />} label={t("review")} href={`/payroll/${run.id}`} variant="ghost" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
