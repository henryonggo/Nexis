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
