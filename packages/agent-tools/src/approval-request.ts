import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { approvalPayloadHash } from "./approval";

/**
 * Create the pending approval_requests row for a proposed mutating tool call
 * (ADR 0002 step 1). The stored payload_hash is computed here with the same
 * implementation `executeTool` verifies with, so an approved request is
 * consumable if and only if the tool is re-invoked with a byte-identical
 * input. RLS: any company member may insert `pending` rows naming themselves.
 */
export async function createApprovalRequest(args: {
  supabase: SupabaseClient<Database>;
  companyId: string;
  toolName: string;
  /** The exact validated tool input the approval authorizes. */
  payload: unknown;
  /** Human-readable proposal for the approval queue (id-ID). */
  summary: string;
}): Promise<
  | { ok: true; requestId: string; payloadHash: string }
  | { ok: false; error: string }
> {
  const payloadHash = await approvalPayloadHash(args.toolName, args.payload);
  const { data, error } = await args.supabase
    .from("approval_requests")
    .insert({
      company_id: args.companyId,
      tool_name: args.toolName,
      payload_hash: payloadHash,
      payload: args.payload as Database["public"]["Tables"]["approval_requests"]["Insert"]["payload"],
      summary: args.summary,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "no row returned" };
  }
  return { ok: true, requestId: data.id, payloadHash };
}

async function findApprovalRequestByStatus(args: {
  supabase: SupabaseClient<Database>;
  companyId: string;
  toolName: string;
  payloadHash: string;
  status: "approved" | "pending";
}): Promise<{ requestId: string } | null> {
  const { data, error } = await args.supabase
    .from("approval_requests")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("tool_name", args.toolName)
    .eq("payload_hash", args.payloadHash)
    .eq("status", args.status)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { requestId: data.id };
}

/**
 * Find the oldest request for this exact tool call (same company, tool_name,
 * payload_hash) the owner has already approved (NEXT-3, docs/pivot/ROADMAP.md).
 * `approved` is a terminal pre-consumption state — `consume_approval` moves a
 * row straight to `consumed` on use, so a row this returns is never already
 * spent. Resolving by hash (not by tool-name slot) means two same-named
 * proposals — or a resume that re-issues them in a different order — each
 * find their OWN approved request.
 */
export async function findConsumableApprovalRequest(args: {
  supabase: SupabaseClient<Database>;
  companyId: string;
  toolName: string;
  payloadHash: string;
}): Promise<{ requestId: string } | null> {
  return findApprovalRequestByStatus({ ...args, status: "approved" });
}

/**
 * Find an existing `pending` request for this exact tool call, so a call
 * that is denied again on resume (owner hasn't decided yet) reuses its
 * original approval_requests row instead of opening a duplicate.
 */
export async function findPendingApprovalRequest(args: {
  supabase: SupabaseClient<Database>;
  companyId: string;
  toolName: string;
  payloadHash: string;
}): Promise<{ requestId: string } | null> {
  return findApprovalRequestByStatus({ ...args, status: "pending" });
}
