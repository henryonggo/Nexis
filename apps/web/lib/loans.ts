import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { formatRupiah } from "@nexis/money";
import { formatPeriod } from "./payroll-format";

/**
 * Employee loans / advances (kasbon) — Stage 7.
 *
 * Fully wired to the generated schema: `employee_loans` / `loan_installments`,
 * the `loan_status` enum, and the `request_loan` / `approve_loan` / `reject_loan`
 * RPCs all live in `packages/types`. The worker deducts due installments at
 * payroll time (`payroll_items.loan_deduction`). See docs/handoff/stage-07-loans.md.
 */

export type LoanStatus = Database["public"]["Enums"]["loan_status"];

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  active: "Berjalan",
  settled: "Lunas",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

export interface LoanView {
  id: string;
  employeeName: string;
  employeeUserId: string | null;
  principal: number;
  installments: number;
  installmentAmount: number;
  reason: string | null;
  status: LoanStatus;
  decisionNote: string | null;
  createdAt: string;
  /** Period label of the next scheduled installment, when known. */
  nextDuePeriod: string | null;
}

type LoanRow = Pick<
  Database["public"]["Tables"]["employee_loans"]["Row"],
  | "id"
  | "principal"
  | "installments"
  | "installment_amount"
  | "reason"
  | "status"
  | "decision_note"
  | "created_at"
  | "next_due_year"
  | "next_due_month"
> & {
  employees: { full_name: string; user_id: string | null } | null;
};

function toView(row: LoanRow): LoanView {
  return {
    id: row.id,
    employeeName: row.employees?.full_name ?? "—",
    employeeUserId: row.employees?.user_id ?? null,
    principal: row.principal,
    installments: row.installments,
    installmentAmount: row.installment_amount,
    reason: row.reason,
    status: row.status,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    nextDuePeriod:
      row.next_due_year && row.next_due_month
        ? formatPeriod(row.next_due_year, row.next_due_month)
        : null,
  };
}

const SELECT =
  "id, principal, installments, installment_amount, reason, status, decision_note, created_at, next_due_year, next_due_month, employees(full_name, user_id)";

/** All loans for the company, newest first. RLS scopes to the company; the admin queue filters. */
export async function getCompanyLoans(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<LoanView[]> {
  const { data } = await supabase
    .from("employee_loans")
    .select(SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as unknown as LoanRow[] | null) ?? []).map(toView);
}

/** The signed-in employee's own loans (mobile/self-service surface; reused on web if needed). */
export async function getEmployeeLoans(
  supabase: SupabaseClient<Database>,
  companyId: string,
  employeeId: string,
): Promise<LoanView[]> {
  const { data } = await supabase
    .from("employee_loans")
    .select(SELECT)
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return ((data as unknown as LoanRow[] | null) ?? []).map(toView);
}

export interface LoanRpcResult {
  error?: string;
}

/** Create a loan request (status pending). RPC asserts caller is in the company. */
export async function requestLoan(
  supabase: SupabaseClient<Database>,
  params: { employeeId: string; principal: number; installments: number; reason?: string },
): Promise<LoanRpcResult> {
  const { error } = await supabase.rpc("request_loan", {
    p_employee_id: params.employeeId,
    p_principal: params.principal,
    p_installments: params.installments,
    p_reason: params.reason ?? "",
  });
  return error ? { error: error.message } : {};
}

/** Approve a pending loan (→ active, schedule generated). Owner/admin/manager only. */
export async function approveLoan(
  supabase: SupabaseClient<Database>,
  loanId: string,
): Promise<LoanRpcResult> {
  const { error } = await supabase.rpc("approve_loan", { p_loan_id: loanId });
  return error ? { error: error.message } : {};
}

/** Reject a pending loan. Owner/admin/manager only. */
export async function rejectLoan(
  supabase: SupabaseClient<Database>,
  loanId: string,
  note?: string,
): Promise<LoanRpcResult> {
  const { error } = await supabase.rpc("reject_loan", {
    p_loan_id: loanId,
    p_decision_note: note,
  });
  return error ? { error: error.message } : {};
}

export { formatRupiah, formatPeriod };
