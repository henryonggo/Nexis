import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/roles";
import { computeEmployeeReadiness, readinessStatus, type ReadinessStatus } from "@/lib/payroll";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { ExportCsvButton } from "@/components/export-csv-button";
import type { EmployeeRow, CompanyBillingRow } from "@nexis/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Plus, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  probation: "warning",
  inactive: "secondary",
  terminated: "destructive",
};

const READINESS_DOT: Record<ReadinessStatus, string> = {
  ready: "bg-success",
  attention: "bg-warning",
  incomplete: "bg-destructive",
};

export default async function EmployeesPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;
  const t = await getTranslations("employees");

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, employee_no, position, department, status, employment_type")
    .eq("company_id", active.id)
    .order("created_at", { ascending: true });

  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan, free_seat_limit, active_seats")
    .eq("company_id", active.id)
    .maybeSingle<Pick<CompanyBillingRow, "plan" | "free_seat_limit" | "active_seats">>();

  // Payroll-readiness per employee (P1-2): same source as the pre-run gate.
  const readiness = await computeEmployeeReadiness(supabase, active.id);
  const readinessById = new Map(readiness.map((r) => [r.employeeId, r]));

  const rows = (employees as Partial<EmployeeRow>[] | null) ?? [];
  const isAdmin = isAdminRole(active.role);
  const seatsUsed = billing?.active_seats ?? rows.length;
  const limit = billing?.free_seat_limit ?? 5;
  const atLimit = billing?.plan === "free" && seatsUsed >= limit;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ICONS["employees"]}
        title={t("title")}
        description={billing?.plan === "free" ? t("seatsUsed", { used: seatsUsed, limit }) : undefined}
        actions={
          isAdmin && (
            <div className="flex items-center gap-2">
              <ExportCsvButton
                filename={`karyawan-${active.name}`}
                headers={["Nama", "Nomor", "Posisi", "Departemen", "Tipe", "Status"]}
                rows={rows.map((e) => [
                  e.full_name ?? "",
                  e.employee_no ?? "",
                  e.position ?? "",
                  e.department ?? "",
                  e.employment_type ?? "",
                  e.status ?? "",
                ])}
              />
              <Button asChild variant="outline" size="sm">
                <Link href="/employees/import" className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  {t("import")}
                </Link>
              </Button>
              <Button asChild size="sm" className={atLimit ? "pointer-events-none opacity-60" : ""}>
                <Link href="/employees/new" aria-disabled={atLimit} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  {t("add")}
                </Link>
              </Button>
            </div>
          )
        }
      />

      {atLimit && (
        <Alert variant="warning">
          {t("limitReached", { limit })}{" "}
          <Link href="/billing" className="font-semibold underline">
            {t("upgradeCta")}
          </Link>{" "}
          {t("toAdd")}
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={ICONS["employees"]}
          title={t("empty")}
          description={isAdmin ? t("emptyAdmin") : undefined}
          action={
            isAdmin && (
              <Button asChild>
                <Link href="/employees/new" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  {t("add")}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.no")}</TableHead>
                <TableHead>{t("columns.position")}</TableHead>
                <TableHead>{t("columns.department")}</TableHead>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-ink">
                    <span className="flex items-center gap-2">
                      {(() => {
                        const r = e.id ? readinessById.get(e.id) : undefined;
                        if (!r) return null;
                        const status = readinessStatus(r);
                        const title =
                          status === "incomplete"
                            ? `${t("readiness.incomplete")}: ${r.issues.map((i) => t(`readiness.issue.${i}`)).join(", ")}`
                            : status === "attention"
                              ? t("readiness.attention")
                              : t("readiness.ready");
                        return (
                          <span
                            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${READINESS_DOT[status]}`}
                            title={title}
                            aria-label={title}
                          />
                        );
                      })()}
                      <Link href={`/employees/${e.id}`} className="font-medium text-brand hover:underline">
                        {e.full_name}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted">{e.employee_no ?? "—"}</TableCell>
                  <TableCell className="text-muted">{e.position ?? "—"}</TableCell>
                  <TableCell className="text-muted">{e.department ?? "—"}</TableCell>
                  <TableCell className="text-muted">{e.employment_type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[e.status ?? ""] ?? "secondary"}>{e.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
