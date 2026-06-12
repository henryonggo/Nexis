"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type DecisionState = { error?: string; ok?: boolean };

function canApprove(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

const decisionSchema = z.object({
  claimId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

/** Best-effort employee notification on a claim decision (never blocks the RPC). */
async function notifyClaimDecision(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  approved: boolean,
): Promise<void> {
  try {
    const { data: claim } = await supabase
      .from("reimbursement_claims")
      .select("employees(user_id, email)")
      .eq("id", claimId)
      .maybeSingle();
    const emp = (claim as { employees?: { user_id: string | null; email: string | null } } | null)
      ?.employees;
    if (!emp?.user_id) return;

    const title = approved ? "Klaim disetujui" : "Klaim ditolak";
    const body = approved
      ? "Klaim reimbursement Anda disetujui dan akan masuk payroll berikutnya."
      : "Klaim reimbursement Anda ditolak. Lihat catatan di aplikasi.";
    await supabase.functions.invoke("send-notification", {
      body: {
        userId: emp.user_id,
        title,
        body,
        emailSubject: `Nexis — ${title}`,
        emailBody: body,
        emailTo: emp.email ?? undefined,
      },
    });
  } catch {
    // notification is non-critical
  }
}

export async function approveClaim(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse({ claimId: formData.get("claimId") });
  if (!parsed.success) return { error: "Klaim tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menyetujui klaim." };

  const supabase = createClient();
  const { error } = await supabase.rpc("approve_claim", { p_claim_id: parsed.data.claimId });
  if (error) return { error: error.message };

  await notifyClaimDecision(supabase, parsed.data.claimId, true);
  revalidatePath("/claims");
  return { ok: true };
}

export async function rejectClaim(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse({
    claimId: formData.get("claimId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Klaim tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menolak klaim." };

  const supabase = createClient();
  const { error } = await supabase.rpc("reject_claim", {
    p_claim_id: parsed.data.claimId,
    p_decision_note: parsed.data.note || undefined,
  });
  if (error) return { error: error.message };

  await notifyClaimDecision(supabase, parsed.data.claimId, false);
  revalidatePath("/claims");
  return { ok: true };
}

export async function approveClaimsBulk(ids: string[]): Promise<DecisionState> {
  if (!ids || ids.length === 0) return { error: "Tidak ada klaim yang dipilih." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menyetujui klaim." };

  const supabase = createClient();
  const errors: string[] = [];

  for (const id of ids) {
    const { error } = await supabase.rpc("approve_claim", { p_claim_id: id });
    if (error) {
      errors.push(`${id}: ${error.message}`);
    } else {
      await notifyClaimDecision(supabase, id, true);
    }
  }

  revalidatePath("/claims");

  if (errors.length > 0) {
    return { error: `Gagal menyetujui beberapa klaim: ${errors.join(", ")}` };
  }

  return { ok: true };
}

export async function rejectClaimsBulk(ids: string[], note?: string): Promise<DecisionState> {
  if (!ids || ids.length === 0) return { error: "Tidak ada klaim yang dipilih." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menolak klaim." };

  const supabase = createClient();
  const errors: string[] = [];

  for (const id of ids) {
    const { error } = await supabase.rpc("reject_claim", {
      p_claim_id: id,
      p_decision_note: note || undefined,
    });
    if (error) {
      errors.push(`${id}: ${error.message}`);
    } else {
      await notifyClaimDecision(supabase, id, false);
    }
  }

  revalidatePath("/claims");

  if (errors.length > 0) {
    return { error: `Gagal menolak beberapa klaim: ${errors.join(", ")}` };
  }

  return { ok: true };
}
