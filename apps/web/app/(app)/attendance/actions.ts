"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

const correctionSchema = z.object({
  id: z.string().uuid("ID tidak valid"),
  isValid: z.enum(["true", "false"]),
  note: z.string().max(280, "Catatan terlalu panjang").optional(),
});

export type CorrectionState = { error?: string; success?: string };

/**
 * Admin/manager correction of an attendance record. RLS still enforces that the
 * caller may write the row; this also gates on the active-company role and writes
 * an audited change (the DB trigger logs it to audit_logs). See Stage 3 spec AC #5.
 */
export async function correctRecord(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const parsed = correctionSchema.safeParse({
    id: formData.get("id"),
    isValid: formData.get("isValid"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role === "employee") {
    return { error: "Hanya admin/manajer yang dapat mengoreksi kehadiran." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("attendance_records")
    .update({
      is_valid: parsed.data.isValid === "true",
      note: parsed.data.note ?? null,
    })
    .eq("id", parsed.data.id)
    .eq("company_id", active.id);

  if (error) return { error: error.message };

  revalidatePath("/attendance");
  return { success: "Kehadiran diperbarui." };
}
