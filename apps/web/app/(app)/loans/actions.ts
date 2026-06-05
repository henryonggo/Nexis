"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { requestLoan, approveLoan, rejectLoan } from "@/lib/loans";

export type LoanActionState = { error?: string; ok?: boolean };

function canManage(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

const requestSchema = z.object({
  employeeId: z.string().uuid("Pilih karyawan yang valid."),
  principal: z.coerce.number().int().positive("Nominal pinjaman harus lebih dari 0."),
  installments: z.coerce.number().int().min(1, "Minimal 1 cicilan.").max(60, "Maksimal 60 cicilan."),
  reason: z.string().trim().max(500).optional(),
});

const decisionSchema = z.object({
  loanId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

/** Create a loan/advance request for an employee (admin/manager initiates). */
export async function requestLoanAction(
  _prev: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const parsed = requestSchema.safeParse({
    employeeId: formData.get("employeeId"),
    principal: formData.get("principal"),
    installments: formData.get("installments"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canManage(active.role)) return { error: "Tidak punya akses membuat pinjaman." };

  const supabase = createClient();
  const { error } = await requestLoan(supabase, {
    employeeId: parsed.data.employeeId,
    principal: parsed.data.principal,
    installments: parsed.data.installments,
    reason: parsed.data.reason,
  });
  if (error) return { error };

  revalidatePath("/loans");
  return { ok: true };
}

export async function approveLoanAction(
  _prev: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const parsed = decisionSchema.safeParse({ loanId: formData.get("loanId") });
  if (!parsed.success) return { error: "Pinjaman tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canManage(active.role)) return { error: "Tidak punya akses menyetujui pinjaman." };

  const supabase = createClient();
  const { error } = await approveLoan(supabase, parsed.data.loanId);
  if (error) return { error };

  revalidatePath("/loans");
  return { ok: true };
}

export async function rejectLoanAction(
  _prev: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const parsed = decisionSchema.safeParse({
    loanId: formData.get("loanId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Pinjaman tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canManage(active.role)) return { error: "Tidak punya akses menolak pinjaman." };

  const supabase = createClient();
  const { error } = await rejectLoan(supabase, parsed.data.loanId, parsed.data.note);
  if (error) return { error };

  revalidatePath("/loans");
  return { ok: true };
}
