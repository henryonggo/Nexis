"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

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
