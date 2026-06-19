import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { Card } from "@/components/ui/card";
import { PayslipsList, type PayslipRow } from "./payslips-list";

/**
 * Employee self-service: list own payslips by period and download the PDFs
 * (single or multiple months at once). RLS scopes `payslips` to the signed-in
 * employee's own rows; the storage policy lets them sign their own PDF.
 */
export default async function PayslipsPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("payslips");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", active.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <Card className="p-5 text-center text-sm text-muted">{t("noProfile")}</Card>
      </div>
    );
  }

  const { data } = await supabase
    .from("payslips")
    .select(
      "id, pdf_path, payroll_items!inner(net_pay, gross_pay, payroll_runs!inner(period_year, period_month))",
    )
    .eq("employee_id", employee.id)
    .order("issued_at", { ascending: false });

  type Joined = {
    id: string;
    pdf_path: string | null;
    payroll_items:
      | {
          net_pay: number;
          gross_pay: number;
          payroll_runs: { period_year: number; period_month: number } | null;
        }
      | null;
  };

  const rows: PayslipRow[] = ((data as unknown as Joined[] | null) ?? [])
    .map((r) => {
      const item = r.payroll_items;
      const run = item?.payroll_runs;
      if (!run) return null;
      return {
        id: r.id,
        hasPdf: Boolean(r.pdf_path),
        periodYear: run.period_year,
        periodMonth: run.period_month,
        netPay: item?.net_pay ?? 0,
      } satisfies PayslipRow;
    })
    .filter((r): r is PayslipRow => r !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-5 text-center text-sm text-muted">{t("empty")}</Card>
      ) : (
        <PayslipsList rows={rows} />
      )}
    </div>
  );
}
