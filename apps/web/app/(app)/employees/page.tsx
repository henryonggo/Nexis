import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
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

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  probation: "warning",
  inactive: "secondary",
  terminated: "destructive",
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

  const rows = (employees as Partial<EmployeeRow>[] | null) ?? [];
  const isAdmin = active.role === "owner" || active.role === "admin";
  const seatsUsed = billing?.active_seats ?? rows.length;
  const limit = billing?.free_seat_limit ?? 5;
  const atLimit = billing?.plan === "free" && seatsUsed >= limit;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
          {billing?.plan === "free" && (
            <p className="text-sm text-muted">{t("seatsUsed", { used: seatsUsed, limit })}</p>
          )}
        </div>
        {isAdmin && (
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
            <Button asChild variant="outline">
              <Link href="/employees/import">{t("import")}</Link>
            </Button>
            <Button asChild className={atLimit ? "pointer-events-none opacity-60" : ""}>
              <Link href="/employees/new" aria-disabled={atLimit}>
                {t("add")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {atLimit && (
        <Alert variant="warning">
          {t("limitReached", { limit })}{" "}
          <Link href="/billing" className="font-semibold underline">
            {t("upgradeCta")}
          </Link>{" "}
          {t("toAdd")}
        </Alert>
      )}

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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted">
                  {t("empty")} {isAdmin && t("emptyAdmin")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-ink">
                    <Link href={`/employees/${e.id}`} className="font-medium text-brand hover:underline">
                      {e.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted">{e.employee_no ?? "—"}</TableCell>
                  <TableCell className="text-muted">{e.position ?? "—"}</TableCell>
                  <TableCell className="text-muted">{e.department ?? "—"}</TableCell>
                  <TableCell className="text-muted">{e.employment_type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[e.status ?? ""] ?? "secondary"}>{e.status}</Badge>
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
