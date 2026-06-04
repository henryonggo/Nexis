import { supabase } from "./supabase";
import type { Database } from "@nexis/types";

export type ClaimStatus = Database["public"]["Enums"]["claim_status"];

export interface ClaimType {
  id: string;
  name: string;
  taxable: boolean;
}

export interface MyClaim {
  id: string;
  amount: number;
  description: string | null;
  status: ClaimStatus;
  claimTypeName: string;
  decisionNote: string | null;
}

const RECEIPT_BUCKET = "claim-receipts";

export async function getClaimTypes(companyId: string): Promise<ClaimType[]> {
  const { data, error } = await supabase
    .from("claim_types")
    .select("id, name, taxable")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return (data as ClaimType[] | null) ?? [];
}

export async function getMyClaims(employeeId: string): Promise<MyClaim[]> {
  const { data, error } = await supabase
    .from("reimbursement_claims")
    .select("id, amount, description, status, decision_note, claim_types(name)")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as any[] | null) ?? []).map((c) => ({
    id: c.id,
    amount: Number(c.amount),
    description: c.description,
    status: c.status,
    claimTypeName: c.claim_types?.name ?? "—",
    decisionNote: c.decision_note,
  }));
}

/** Upload a receipt photo to the private bucket under {company}/{employee}/... */
export async function uploadReceipt(
  companyId: string,
  employeeId: string,
  uri: string,
): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.arrayBuffer();
  const path = `${companyId}/${employeeId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Submit a reimbursement claim (status defaults to `pending`). Amount is integer
 * rupiah. RLS enforces the employee inserts only their own claim.
 */
export async function submitClaim(args: {
  companyId: string;
  employeeId: string;
  claimTypeId: string;
  amount: number;
  description?: string;
  receiptPath?: string;
}): Promise<void> {
  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    throw new Error("Jumlah harus berupa rupiah bulat yang lebih dari 0.");
  }
  const { error } = await supabase.from("reimbursement_claims").insert({
    company_id: args.companyId,
    employee_id: args.employeeId,
    claim_type_id: args.claimTypeId,
    amount: args.amount,
    description: args.description || null,
    receipt_path: args.receiptPath || null,
  });
  if (error) throw error;
}

/** Parse a user-entered rupiah string (e.g. "150.000" or "150000") to integer rupiah. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
}
