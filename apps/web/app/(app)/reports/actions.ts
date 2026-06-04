"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { enqueueReportJob } from "@/lib/report-worker";

const createReportSchema = z.object({
  reportType: z.enum(["payroll_summary", "bpjs_contribution", "pph21_ebupot", "bpjs_sipp"]),
  payrollRunId: z.string().uuid("Pilih run payroll yang valid."),
});

export type ReportActionState = { error?: string; ok?: boolean };

function canExport(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/**
 * Queue a report export. Inserts a `report_jobs` row (pending) and triggers the
 * payroll worker, which renders the XLSX into the private `reports` bucket and
 * advances the job to completed. RLS restricts the insert to owner/admin/manager;
 * the worker (service role) does the heavy lifting and finalizes the status.
 */
export async function createReportJob(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const parsed = createReportSchema.safeParse({
    reportType: formData.get("reportType"),
    payrollRunId: formData.get("payrollRunId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canExport(active.role)) {
    return { error: "Hanya admin/pemilik/manajer yang dapat membuat laporan." };
  }

  const supabase = createClient();
  const { reportType, payrollRunId } = parsed.data;

  // Guard: the run must belong to this company and be finalized (RLS already scopes
  // reads to the company; this gives a clear error instead of a worker failure).
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .eq("id", payrollRunId)
    .eq("company_id", active.id)
    .maybeSingle();
  if (!run || (run.status !== "completed" && run.status !== "paid")) {
    return { error: "Run payroll belum selesai diproses, laporan belum bisa dibuat." };
  }

  const { data: inserted, error } = await supabase
    .from("report_jobs")
    .insert({
      company_id: active.id,
      report_type: reportType,
      status: "pending",
      parameters: { payrollRunId },
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const enqueued = await enqueueReportJob(inserted.id);
  if (!enqueued.ok) {
    // Worker unreachable — mark the job failed so it doesn't linger as "pending"
    // forever; the admin can simply create a new one once the worker is up.
    await supabase
      .from("report_jobs")
      .update({ status: "failed", error_message: enqueued.error })
      .eq("id", inserted.id)
      .eq("company_id", active.id);
    revalidatePath("/reports");
    return {
      error: `Worker laporan belum dapat dihubungi (${enqueued.error}). Coba lagi nanti.`,
    };
  }

  revalidatePath("/reports");
  return { ok: true };
}
