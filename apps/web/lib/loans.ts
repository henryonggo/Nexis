import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { formatRupiah } from "@nexis/money";
import { formatPeriod } from "./payroll-format";

/**
 * Employee loans / advances (kasbon) — Stage 7.
 *
 * TODO(db): this feature is blocked on Antigravity landing the schema below.
 * See docs/handoff/stage-07-loans.md for the full request. Until the migration +
 * `pnpm db:types` land, the generated `Database` type has no `employee_loans` /
 * `loan_installments` tables and no `request_loan` / `approve_loan` / `reject_loan`
 * RPCs, so all Supabase access here goes through `loanDb()` — a single typed cast
 * that quarantines the gap. When the types regen, delete `loanDb`/the local row
 * interfaces and point these queries at the generated types (and remove this note).
 *
 * Required shape (mirrors reimbursement_claims / approve_claim):
 *   table employee_loans(
 *     id uuid pk, company_id uuid, employee_id uuid,
 *     principal bigint,            -- integer rupiah
 *     installments int,            -- number of monthly deductions
 *     installment_amount bigint,   -- principal / installments (rounded)
 *     reason text, status loan_status,
 *     decided_at timestamptz, decided_by uuid, decision_note text,
 *     disbursed_at timestamptz, created_at timestamptz)
 *   enum loan_status = pending | approved | active | settled | rejected | cancelled
 *   rpc request_loan(p_employee_id uuid, p_principal bigint, p_installments int, p_reason text) returns uuid
 *   rpc approve_loan(p_loan_id uuid) returns void   -- flips approved→active, builds the installment schedule
 *   rpc reject_loan(p_loan_id uuid, p_decision_note text default null) returns void
 */

export type LoanStatus =
  | "pending"
  | "approved"
  | "active"
  | "settled"
  | "rejected"
  | "cancelled";

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

/** Shape we expect from `employee_loans` joined to `employees` (pre-codegen). */
interface RawLoanRow {
  id: string;
  principal: number;
  installments: number;
  installment_amount: number;
  reason: string | null;
  status: LoanStatus;
  decision_note: string | null;
  created_at: string;
  next_due_year: number | null;
  next_due_month: number | null;
  employees: { full_name: string; user_id: string | null } | null;
}

/**
 * The single quarantined cast for this not-yet-generated feature. Everything else
 * in this module stays fully typed against the interfaces above. Delete once
 * `packages/types` includes the loans tables/RPCs (TODO(db)).
 */
function loanDb(supabase: SupabaseClient<Database>) {
  return supabase as unknown as SupabaseClient<any>;
}

function toView(row: RawLoanRow): LoanView {
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
  const { data } = await loanDb(supabase)
    .from("employee_loans")
    .select(SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as RawLoanRow[] | null) ?? []).map(toView);
}

/** The signed-in employee's own loans (mobile/self-service surface; reused on web if needed). */
export async function getEmployeeLoans(
  supabase: SupabaseClient<Database>,
  companyId: string,
  employeeId: string,
): Promise<LoanView[]> {
  const { data } = await loanDb(supabase)
    .from("employee_loans")
    .select(SELECT)
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return ((data as RawLoanRow[] | null) ?? []).map(toView);
}

export interface LoanRpcResult {
  error?: string;
}

/** Create a loan request (status pending). TODO(db): rpc request_loan. */
export async function requestLoan(
  supabase: SupabaseClient<Database>,
  params: { employeeId: string; principal: number; installments: number; reason?: string },
): Promise<LoanRpcResult> {
  const { error } = await loanDb(supabase).rpc("request_loan", {
    p_employee_id: params.employeeId,
    p_principal: params.principal,
    p_installments: params.installments,
    p_reason: params.reason ?? null,
  });
  return error ? { error: error.message } : {};
}

/** Approve a pending loan (→ active, schedule generated). TODO(db): rpc approve_loan. */
export async function approveLoan(
  supabase: SupabaseClient<Database>,
  loanId: string,
): Promise<LoanRpcResult> {
  const { error } = await loanDb(supabase).rpc("approve_loan", { p_loan_id: loanId });
  return error ? { error: error.message } : {};
}

/** Reject a pending loan. TODO(db): rpc reject_loan. */
export async function rejectLoan(
  supabase: SupabaseClient<Database>,
  loanId: string,
  note?: string,
): Promise<LoanRpcResult> {
  const { error } = await loanDb(supabase).rpc("reject_loan", {
    p_loan_id: loanId,
    p_decision_note: note ?? null,
  });
  return error ? { error: error.message } : {};
}

export { formatRupiah, formatPeriod };
