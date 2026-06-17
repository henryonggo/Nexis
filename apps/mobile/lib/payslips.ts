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
  // top-line
  netPay: number;
  grossPay: number;
  status: string;
  // breakdown (all integer rupiah)
  baseSalary: number;
  allowances: number;
  overtimePay: number;
  bpjsKesEmployee: number;
  jhtEmployee: number;
  jpEmployee: number;
  pph21: number;
  loanDeduction: number;
}

const PAYSLIP_SELECT =
  "id, pdf_path, issued_at, employee_id, payroll_items!inner(" +
  "net_pay, gross_pay, base_salary, allowances, overtime_pay, " +
  "bpjs_kes_employee, jht_employee, jp_employee, pph21, loan_deduction, " +
  "payroll_runs!inner(period_year, period_month, status)" +
  ")";

function mapRow(row: any): Payslip {
  const item = Array.isArray(row.payroll_items) ? row.payroll_items[0] : row.payroll_items;
  const run = Array.isArray(item?.payroll_runs) ? item.payroll_runs[0] : item?.payroll_runs;
  return {
    id: row.id,
    pdfPath: row.pdf_path,
    issuedAt: row.issued_at,
    periodYear: run?.period_year ?? 0,
    periodMonth: run?.period_month ?? 0,
    status: run?.status ?? "",
    netPay: Number(item?.net_pay ?? 0),
    grossPay: Number(item?.gross_pay ?? 0),
    baseSalary: Number(item?.base_salary ?? 0),
    allowances: Number(item?.allowances ?? 0),
    overtimePay: Number(item?.overtime_pay ?? 0),
    bpjsKesEmployee: Number(item?.bpjs_kes_employee ?? 0),
    jhtEmployee: Number(item?.jht_employee ?? 0),
    jpEmployee: Number(item?.jp_employee ?? 0),
    pph21: Number(item?.pph21 ?? 0),
    loanDeduction: Number(item?.loan_deduction ?? 0),
  };
}

/**
 * The signed-in employee's payslips, newest period first. RLS guarantees an
 * employee only sees their own payslips. Joined through payroll_items →
 * payroll_runs for the period + net pay + full breakdown.
 */
export async function getMyPayslips(employeeId: string): Promise<Payslip[]> {
  const { data, error } = await supabase
    .from("payslips")
    .select(PAYSLIP_SELECT)
    .eq("employee_id", employeeId)
    .order("issued_at", { ascending: false });

  if (error) throw error;
  return ((data as any[] | null) ?? []).map(mapRow);
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
