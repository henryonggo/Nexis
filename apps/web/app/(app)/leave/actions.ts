"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type DecisionState = { error?: string; ok?: boolean };

/** owner/admin/manager may decide leave; RLS + the SECURITY DEFINER RPC re-check. */
function canApprove(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

/**
 * Best-effort employee notification (Expo push + email) via the send-notification
 * Edge Function. Notifications must never block or fail the decision, so errors are
 * swallowed — the balance change already committed in the RPC.
 */
async function notifyLeaveDecision(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  approved: boolean,
): Promise<void> {
  try {
    const { data: req } = await supabase
      .from("leave_requests")
      .select("start_date, end_date, employees(user_id, email)")
      .eq("id", requestId)
      .maybeSingle();
    const emp = (req as { employees?: { user_id: string | null; email: string | null } } | null)
      ?.employees;
    if (!emp?.user_id) return;

    const title = approved ? "Cuti disetujui" : "Cuti ditolak";
    const body = approved
      ? "Permintaan cuti Anda telah disetujui."
      : "Permintaan cuti Anda ditolak. Lihat catatan di aplikasi.";
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

export async function approveLeave(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return { error: "Permintaan tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menyetujui cuti." };

  const supabase = createClient();
  const { error } = await supabase.rpc("approve_leave", { p_request_id: parsed.data.requestId });
  if (error) return { error: error.message };

  await notifyLeaveDecision(supabase, parsed.data.requestId, true);
  revalidatePath("/leave");
  return { ok: true };
}

export async function rejectLeave(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Permintaan tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menolak cuti." };

  const supabase = createClient();
  const { error } = await supabase.rpc("reject_leave", {
    p_request_id: parsed.data.requestId,
    p_decision_note: parsed.data.note || undefined,
  });
  if (error) return { error: error.message };

  await notifyLeaveDecision(supabase, parsed.data.requestId, false);
  revalidatePath("/leave");
  return { ok: true };
}

export async function approveLeavesBulk(ids: string[]): Promise<DecisionState> {
  if (!ids || ids.length === 0) return { error: "Tidak ada permintaan yang dipilih." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menyetujui cuti." };

  const supabase = createClient();
  const errors: string[] = [];

  for (const id of ids) {
    const { error } = await supabase.rpc("approve_leave", { p_request_id: id });
    if (error) {
      errors.push(`${id}: ${error.message}`);
    } else {
      await notifyLeaveDecision(supabase, id, true);
    }
  }

  revalidatePath("/leave");

  if (errors.length > 0) {
    return { error: `Gagal menyetujui beberapa cuti: ${errors.join(", ")}` };
  }

  return { ok: true };
}

export async function rejectLeavesBulk(ids: string[], note?: string): Promise<DecisionState> {
  if (!ids || ids.length === 0) return { error: "Tidak ada permintaan yang dipilih." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canApprove(active.role)) return { error: "Tidak punya akses menolak cuti." };

  const supabase = createClient();
  const errors: string[] = [];

  for (const id of ids) {
    const { error } = await supabase.rpc("reject_leave", {
      p_request_id: id,
      p_decision_note: note || undefined,
    });
    if (error) {
      errors.push(`${id}: ${error.message}`);
    } else {
      await notifyLeaveDecision(supabase, id, false);
    }
  }

  revalidatePath("/leave");

  if (errors.length > 0) {
    return { error: `Gagal menolak beberapa cuti: ${errors.join(", ")}` };
  }

  return { ok: true };
}
