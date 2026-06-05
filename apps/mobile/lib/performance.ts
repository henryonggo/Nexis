import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";

/**
 * Performance & KPI — Stage 7 (employee self-service).
 *
 * TODO(db): blocked on Antigravity landing the schema in
 * docs/handoff/stage-07-performance.md. Until `pnpm db:types` regenerates with
 * `performance_goals` / `performance_reviews` and the `acknowledge_review` RPC,
 * Supabase access goes through `perfDb()` — a single quarantined cast. Delete it
 * and point at generated types once they land.
 */

export type GoalStatus = "on_track" | "at_risk" | "off_track" | "done" | "cancelled";
export type ReviewStatus = "draft" | "submitted" | "acknowledged";

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: "Sesuai target",
  at_risk: "Berisiko",
  off_track: "Meleset",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draf",
  submitted: "Menunggu persetujuan Anda",
  acknowledged: "Sudah disetujui",
};

export interface MyGoal {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  progress: number;
  status: GoalStatus;
}

export interface MyReview {
  id: string;
  overallRating: number | null;
  summary: string | null;
  status: ReviewStatus;
}

function perfDb(client: SupabaseClient<Database>) {
  return client as unknown as SupabaseClient<any>;
}

export async function getMyGoals(employeeId: string): Promise<MyGoal[]> {
  const { data, error } = await perfDb(supabase)
    .from("performance_goals")
    .select("id, title, description, weight, progress, status")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as any[] | null) ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    weight: Number(g.weight),
    progress: Number(g.progress),
    status: g.status,
  }));
}

/** Update progress on the employee's own goal (RLS allows self-update of progress). */
export async function updateMyGoalProgress(goalId: string, progress: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const patch: Record<string, unknown> = {
    progress: clamped,
    updated_at: new Date().toISOString(),
  };
  if (clamped >= 100) patch.status = "done";
  const { error } = await perfDb(supabase)
    .from("performance_goals")
    .update(patch)
    .eq("id", goalId);
  if (error) throw error;
}

export async function getMyReviews(employeeId: string): Promise<MyReview[]> {
  const { data, error } = await perfDb(supabase)
    .from("performance_reviews")
    .select("id, overall_rating, summary, status")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as any[] | null) ?? []).map((r) => ({
    id: r.id,
    overallRating: r.overall_rating === null ? null : Number(r.overall_rating),
    summary: r.summary,
    status: r.status,
  }));
}

/** Acknowledge a submitted review (RPC asserts caller is the reviewee + audits). */
export async function acknowledgeReview(reviewId: string): Promise<void> {
  const { error } = await perfDb(supabase).rpc("acknowledge_review", {
    p_review_id: reviewId,
  });
  if (error) throw error;
}
