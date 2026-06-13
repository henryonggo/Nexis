"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Database } from "@nexis/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { computeRunPreview, computeRunReadiness, type RunType } from "@/lib/payroll";
import { enqueuePayrollRun } from "@/lib/payroll-worker";

const now = new Date();

const createRunSchema = z.object({
  year: z.coerce.number().int().min(2020).max(now.getUTCFullYear() + 1),
  month: z.coerce.number().int().min(1).max(12),
  runType: z.enum(["monthly", "thr"]),
});

export type RunActionState = { error?: string };

function isAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Create a draft payroll run for a period. Computes a preview to snapshot the
 * effective rate config onto the run (reproducibility, AC #5) and pre-fill the
 * estimated totals shown in the list. The authoritative compute (payroll_items +
 * payslips) happens when the run is approved and the Cloud Run worker processes
 * it. RLS also enforces the company/role write.
 */
export async function createDraftRun(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  const parsed = createRunSchema.safeParse({
    year: formData.get("year"),
    month: formData.get("month"),
    runType: formData.get("runType"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!isAdmin(active.role)) {
    return { error: "Hanya admin/pemilik yang dapat menjalankan payroll." };
  }

  const supabase = createClient();
  const { year, month, runType } = parsed.data;

  // One draft/active run per period+type guard (idempotency at the UI layer; the
  // DB has a uniqueness constraint as the real backstop — AC #6).
  const { data: existing } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .eq("company_id", active.id)
    .eq("period_year", year)
    .eq("period_month", month)
    .not("status", "in", "(failed,cancelled)")
    .maybeSingle();
  if (existing) {
    redirect(`/payroll/${existing.id}`);
  }

  // Readiness gate (G7): refuse to draft while any active employee is missing
  // compensation, a tax profile, or a bank account — otherwise the engine would
  // silently fall back (e.g. TK/0) and produce a wrong-but-plausible payroll.
  const readiness = await computeRunReadiness(supabase, active.id, { year, month });
  if (!readiness.ready) {
    return {
      error: `Belum bisa membuat draf: ${readiness.blockers.length} karyawan belum lengkap (rekening bank, profil pajak, atau kompensasi). Lengkapi data karyawan dulu.`,
    };
  }

  const preview = await computeRunPreview(supabase, active.id, {
    year,
    month,
    runType: runType as RunType,
    plan: active.plan,
  });

  const { data: inserted, error } = await supabase
    .from("payroll_runs")
    .insert({
      company_id: active.id,
      period_year: year,
      period_month: month,
      status: "draft",
      config_snapshot: preview.configSnapshot as Database["public"]["Tables"]["payroll_runs"]["Insert"]["config_snapshot"],
      total_gross: preview.totals.gross,
      total_bpjs_employee: preview.totals.bpjsEmployee,
      total_bpjs_employer: preview.totals.bpjsEmployer,
      total_pph21: preview.totals.pph21,
      total_net: preview.totals.net,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  redirect(`/payroll/${inserted.id}`);
}

/**
 * Approve a draft run and enqueue it for processing. Moves draft → queued; the
 * Cloud Run worker (not yet built) picks queued runs up, computes and persists
 * payroll_items + payslips, and advances the status to completed.
 */
export async function approveRun(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  const runId = z.string().uuid().safeParse(formData.get("runId"));
  if (!runId.success) return { error: "ID run tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!isAdmin(active.role)) return { error: "Hanya admin/pemilik yang dapat menyetujui run." };

  const supabase = createClient();
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "queued" })
    .eq("id", runId.data)
    .eq("company_id", active.id)
    .eq("status", "draft"); // only a draft can be approved (idempotent)

  if (error) return { error: error.message };

  // Hand off to the payroll worker (computes + writes payroll_items/payslips and
  // advances the run to completed). The run is already 'queued', so if the worker
  // is unreachable it stays queued and can be retried — surface a soft error.
  const enqueued = await enqueuePayrollRun(runId.data);

  if (!enqueued.ok) {
    // Worker unreachable — roll back to draft (only if the worker hasn't already
    // moved it past queued) so the admin can retry approval.
    await supabase
      .from("payroll_runs")
      .update({ status: "draft" })
      .eq("id", runId.data)
      .eq("company_id", active.id)
      .eq("status", "queued");
    revalidatePath("/payroll");
    revalidatePath(`/payroll/${runId.data}`);
    return {
      error: `Worker payroll belum dapat dihubungi (${enqueued.error}). Run dikembalikan ke draf — coba setujui lagi.`,
    };
  }

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId.data}`);
  return {};
}

/** Mark a completed run as paid. Guard: only completed → paid. */
export async function markRunPaid(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  const runId = z.string().uuid().safeParse(formData.get("runId"));
  if (!runId.success) return { error: "ID run tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!isAdmin(active.role)) return { error: "Hanya admin/pemilik yang dapat menandai dibayar." };

  const supabase = createClient();
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "paid" })
    .eq("id", runId.data)
    .eq("company_id", active.id)
    .eq("status", "completed");

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId.data}`);
  return {};
}

/** Cancel a run that has not been paid. */
export async function cancelRun(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  const runId = z.string().uuid().safeParse(formData.get("runId"));
  if (!runId.success) return { error: "ID run tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!isAdmin(active.role)) return { error: "Hanya admin/pemilik yang dapat membatalkan run." };

  const supabase = createClient();
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "cancelled" })
    .eq("id", runId.data)
    .eq("company_id", active.id)
    .in("status", ["draft", "queued", "failed"]);

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId.data}`);
  return {};
}
