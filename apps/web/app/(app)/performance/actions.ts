"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  createCycle,
  createGoal,
  updateGoalProgress,
  saveReviewDraft,
  submitReview,
} from "@/lib/performance";

export type PerfActionState = { error?: string; ok?: boolean };

function canManage(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

const cycleSchema = z
  .object({
    name: z.string().trim().min(1, "Nama siklus wajib diisi.").max(120),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal mulai tidak valid."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal selesai tidak valid."),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "Tanggal selesai harus setelah tanggal mulai.",
    path: ["endDate"],
  });

const goalSchema = z.object({
  employeeId: z.string().uuid("Pilih karyawan yang valid."),
  cycleId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Judul sasaran wajib diisi.").max(160),
  description: z.string().trim().max(1000).optional(),
  weight: z.coerce.number().int().min(0).max(100),
});

const progressSchema = z.object({
  goalId: z.string().uuid(),
  progress: z.coerce.number().int().min(0).max(100),
});

const reviewSchema = z.object({
  cycleId: z.string().uuid(),
  employeeId: z.string().uuid(),
  overallRating: z.coerce.number().min(1).max(5),
  summary: z.string().trim().max(2000).optional(),
});

const submitSchema = z.object({ reviewId: z.string().uuid() });

async function guard(): Promise<{ companyId: string } | { error: string }> {
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!canManage(active.role)) return { error: "Tidak punya akses mengelola kinerja." };
  return { companyId: active.id };
}

export async function createCycleAction(
  _prev: PerfActionState,
  formData: FormData,
): Promise<PerfActionState> {
  const parsed = cycleSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { error } = await createCycle(createClient(), g.companyId, parsed.data);
  if (error) return { error };
  revalidatePath("/performance");
  return { ok: true };
}

export async function createGoalAction(
  _prev: PerfActionState,
  formData: FormData,
): Promise<PerfActionState> {
  const parsed = goalSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId") ?? undefined,
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    weight: formData.get("weight"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { error } = await createGoal(createClient(), g.companyId, {
    employeeId: parsed.data.employeeId,
    cycleId: parsed.data.cycleId ?? null,
    title: parsed.data.title,
    description: parsed.data.description,
    weight: parsed.data.weight,
  });
  if (error) return { error };
  revalidatePath("/performance");
  return { ok: true };
}

export async function updateGoalProgressAction(
  _prev: PerfActionState,
  formData: FormData,
): Promise<PerfActionState> {
  const parsed = progressSchema.safeParse({
    goalId: formData.get("goalId"),
    progress: formData.get("progress"),
  });
  if (!parsed.success) return { error: "Progres tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  // Derive a coarse status from progress so the badge stays meaningful.
  const status = parsed.data.progress >= 100 ? "done" : undefined;
  const { error } = await updateGoalProgress(
    createClient(),
    parsed.data.goalId,
    parsed.data.progress,
    status,
  );
  if (error) return { error };
  revalidatePath("/performance");
  return { ok: true };
}

export async function saveReviewAction(
  _prev: PerfActionState,
  formData: FormData,
): Promise<PerfActionState> {
  const parsed = reviewSchema.safeParse({
    cycleId: formData.get("cycleId"),
    employeeId: formData.get("employeeId"),
    overallRating: formData.get("overallRating"),
    summary: formData.get("summary") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { error } = await saveReviewDraft(createClient(), g.companyId, parsed.data);
  if (error) return { error };
  revalidatePath("/performance");
  return { ok: true };
}

export async function submitReviewAction(
  _prev: PerfActionState,
  formData: FormData,
): Promise<PerfActionState> {
  const parsed = submitSchema.safeParse({ reviewId: formData.get("reviewId") });
  if (!parsed.success) return { error: "Penilaian tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { error } = await submitReview(createClient(), parsed.data.reviewId);
  if (error) return { error };
  revalidatePath("/performance");
  return { ok: true };
}
