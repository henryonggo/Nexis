import "server-only";
import type { Database } from "@nexis/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimStatus = Database["public"]["Enums"]["claim_status"];

/** A reimbursement claim joined with its type + employee, for the admin queue. */
export interface ClaimView {
  id: string;
  amount: number;
  description: string | null;
  receiptPath: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  createdAt: string;
  payrollRunId: string | null;
  employeeName: string;
  employeeUserId: string | null;
  claimTypeName: string;
  taxable: boolean;
}

interface RawClaimRow {
  id: string;
  amount: number;
  description: string | null;
  receipt_path: string | null;
  status: ClaimStatus;
  decision_note: string | null;
  created_at: string;
  payroll_run_id: string | null;
  employees: { full_name: string; user_id: string | null } | null;
  claim_types: { name: string; taxable: boolean } | null;
}

/**
 * Every reimbursement claim in the active company, newest first. RLS restricts the
 * rows to managers/admins of the company; the queue filters to `pending`.
 */
export async function getCompanyClaims(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<ClaimView[]> {
  const { data, error } = await supabase
    .from("reimbursement_claims")
    .select(
      "id, amount, description, receipt_path, status, decision_note, created_at, payroll_run_id, employees(full_name, user_id), claim_types(name, taxable)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data as unknown as RawClaimRow[] | null) ?? []).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    description: r.description,
    receiptPath: r.receipt_path,
    status: r.status,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    payrollRunId: r.payroll_run_id,
    employeeName: r.employees?.full_name ?? "—",
    employeeUserId: r.employees?.user_id ?? null,
    claimTypeName: r.claim_types?.name ?? "—",
    taxable: r.claim_types?.taxable ?? false,
  }));
}

/** A short-lived signed URL for a claim receipt in the private bucket. */
export async function getReceiptUrl(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<string | null> {
  const { data } = await supabase.storage.from("claim-receipts").createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
