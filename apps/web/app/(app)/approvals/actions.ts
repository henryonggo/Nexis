"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CycleResult } from "@nexis/orchestrator";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { runAgentCycleForActiveCompany } from "@/lib/agent-cycle";

/**
 * Owner/admin decision on an agent approval request (ADR 0002 step 2).
 * RLS ("approval_requests: admin decide") is the real gate — it only permits
 * pending → approved/rejected by a company admin naming themselves as
 * decider; the checks here are UX convenience. Consumption (single-use,
 * hash-bound) happens later in packages/agent-tools when the agent re-runs
 * the tool with this request id as its approval token.
 */
const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
});

export async function decideApprovalRequest(formData: FormData): Promise<void> {
  const parsed = decideSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return;

  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("approval_requests")
    .update({
      status: parsed.data.decision === "approve" ? "approved" : "rejected",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("company_id", active.id)
    .eq("status", "pending");

  revalidatePath("/approvals");
}

/** Serializable slice of a CycleResult for the client panel. */
export interface AgentCycleState {
  error?: string;
  result?: Pick<CycleResult, "status" | "finalText" | "halts" | "pendingApprovals">;
}

const cycleSchema = z.object({
  instruction: z.string().trim().min(4).max(500),
  /** Resume: an approved approval_requests id, paired with its tool name. */
  resumeRequestId: z.string().uuid().optional().or(z.literal("")),
  resumeTool: z.string().optional().or(z.literal("")),
});

/**
 * Start or resume one orchestrator cycle (ADR 0004). Resume hands the
 * approved request id to its tool as a single-use token; consume_approval
 * enforces single use + payload binding server-side.
 */
export async function runAgentCycle(
  _prev: AgentCycleState,
  formData: FormData,
): Promise<AgentCycleState> {
  const parsed = cycleSchema.safeParse({
    instruction: formData.get("instruction"),
    resumeRequestId: formData.get("resumeRequestId") ?? "",
    resumeTool: formData.get("resumeTool") ?? "",
  });
  if (!parsed.success) return { error: "Instruksi tidak valid." };

  const approvalTokens =
    parsed.data.resumeRequestId && parsed.data.resumeTool
      ? { [parsed.data.resumeTool]: parsed.data.resumeRequestId }
      : undefined;

  // Any throw (Anthropic 5xx, network, tool bug) must land in the panel's
  // error state, not Next's generic error page — the owner runs the dry run
  // from here (CODE-REVIEW-2026-07 §Fix 1).
  let outcome: Awaited<ReturnType<typeof runAgentCycleForActiveCompany>>;
  try {
    outcome = await runAgentCycleForActiveCompany({
      instruction: parsed.data.instruction,
      approvalTokens,
    });
  } catch (err) {
    console.error("runAgentCycle failed", err);
    return {
      error: `Siklus agen gagal: ${err instanceof Error ? err.message : "kesalahan tak terduga"}. Coba lagi.`,
    };
  }
  if ("error" in outcome) return { error: outcome.error };

  revalidatePath("/approvals");
  revalidatePath("/payroll");
  revalidatePath("/dashboard");
  const { status, finalText, halts, pendingApprovals } = outcome.result;
  return { result: { status, finalText, halts, pendingApprovals } };
}
