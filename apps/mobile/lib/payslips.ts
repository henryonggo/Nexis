import { supabase } from "./supabase";

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export interface Payslip {
  id: string;
  pdfPath: string | null;
  issuedAt: string;
  periodYear: number;
  periodMonth: number;
  netPay: number;
  status: string;
}

/**
 * The signed-in employee's payslips, newest period first. RLS guarantees an
 * employee only sees their own payslips. Joined through payroll_items →
 * payroll_runs for the period + net pay.
 */
export async function getMyPayslips(employeeId: string): Promise<Payslip[]> {
  const { data, error } = await supabase
    .from("payslips")
    .select(
      "id, pdf_path, issued_at, payroll_items!inner(net_pay, payroll_runs!inner(period_year, period_month, status))",
    )
    .eq("employee_id", employeeId)
    .order("issued_at", { ascending: false });

  if (error) throw error;

  return ((data as any[] | null) ?? []).map((row) => {
    const item = Array.isArray(row.payroll_items) ? row.payroll_items[0] : row.payroll_items;
    const run = Array.isArray(item?.payroll_runs) ? item.payroll_runs[0] : item?.payroll_runs;
    return {
      id: row.id,
      pdfPath: row.pdf_path,
      issuedAt: row.issued_at,
      netPay: Number(item?.net_pay ?? 0),
      periodYear: run?.period_year ?? 0,
      periodMonth: run?.period_month ?? 0,
      status: run?.status ?? "",
    };
  });
}

/** A short-lived signed URL to download/open a payslip PDF from private storage. */
export async function getPayslipSignedUrl(pdfPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("payslips")
    .createSignedUrl(pdfPath, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Gagal membuat tautan unduhan.");
  }
  return data.signedUrl;
}

export function formatPeriod(year: number, month: number): string {
  return `${MONTH_NAMES_ID[month - 1] ?? month} ${year}`;
}

export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
}
