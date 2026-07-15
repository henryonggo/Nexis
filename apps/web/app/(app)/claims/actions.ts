"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { isManagerRole } from "@/lib/roles";

export type DecisionState = { error?: string; ok?: boolean };

function canApprove(role: string): boolean {
  return isManagerRole(role);
}

const requestSchema = z.object({
  claimTypeId: z.string().uuid(),
  amount: z.number().int().positive(),
  description: z.string().trim().max(500).optional(),
});

/** Parse a user-entered rupiah string (e.g. "150.000" or "150000") to integer rupiah. */
function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Employee self-service: submit a reimbursement claim for the signed-in user's
 * own employee record, with an optional receipt image. RLS enforces an employee
 * can only insert their own claim; amount is integer rupiah (AGENTS.md rule 3).
 */
export async function requestClaim(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = requestSchema.safeParse({
    claimTypeId: formData.get("claimTypeId"),
    amount: parseRupiah((formData.get("amount") as string) ?? ""),
    description: (formData.get("description") as string) || undefined,
  });
  if (!parsed.success) return { error: "Jumlah harus rupiah bulat lebih dari 0." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi tidak ditemukan." };

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", active.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!employee) return { error: "Akun ini belum tertaut ke data karyawan." };

  let receiptPath: string | null = null;
  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    const ext = receipt.type === "application/pdf" ? "pdf" : "jpg";
    const path = `${active.id}/${employee.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("claim-receipts")
      .upload(path, await receipt.arrayBuffer(), { contentType: receipt.type, upsert: false });
    if (upErr) return { error: upErr.message };
    receiptPath = path;
  }

  const { error } = await supabase.from("reimbursement_claims").insert({
    company_id: active.id,
    employee_id: employee.id,
    claim_type_id: parsed.data.claimTypeId,
    amount: parsed.data.amount,
    description: parsed.data.description || null,
    receipt_path: receiptPath,
  });
  if (error) return { error: error.message };

  revalidatePath("/claims");
  return { ok: true };
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
