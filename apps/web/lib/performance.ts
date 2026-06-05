import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";

/**
 * Performance & KPI — Stage 7.
 *
 * Wired to the generated schema: `review_cycles` / `performance_goals` /
 * `performance_reviews`, the `goal_status` / `review_status` enums, and the
 * `submit_review` / `acknowledge_review` RPCs all live in `packages/types`.
 * See docs/handoff/stage-07-performance.md.
 */

type GoalRowT = Database["public"]["Tables"]["performance_goals"]["Row"];
type ReviewRowT = Database["public"]["Tables"]["performance_reviews"]["Row"];

export type CycleStatus = "draft" | "active" | "closed";
export type GoalStatus = Database["public"]["Enums"]["goal_status"];
export type ReviewStatus = Database["public"]["Enums"]["review_status"];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  on_track: "Sesuai target",
  at_risk: "Berisiko",
  off_track: "Meleset",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "Draf",
  submitted: "Terkirim",
  acknowledged: "Disetujui karyawan",
};

export interface CycleView {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: CycleStatus;
}

export interface GoalView {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  description: string | null;
  weight: number;
  progress: number;
  status: GoalStatus;
}

export interface ReviewView {
  id: string;
  employeeId: string;
  employeeName: string;
  overallRating: number | null;
  summary: string | null;
  status: ReviewStatus;
}

type GoalRow = Pick<
  GoalRowT,
  "id" | "employee_id" | "title" | "description" | "weight" | "progress" | "status"
> & { employees: { full_name: string } | null };

type ReviewRow = Pick<
  ReviewRowT,
  "id" | "employee_id" | "overall_rating" | "summary" | "status"
> & { employees: { full_name: string } | null };

// ── Cycles ───────────────────────────────────────────────────────────────────

/** Review cycles for the company, newest first. RLS scopes to company members. */
export async function getCycles(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<CycleView[]> {
  const { data } = await supabase
    .from("review_cycles")
    .select("id, name, start_date, end_date, status")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  return ((data ?? []) as Database["public"]["Tables"]["review_cycles"]["Row"][]).map((c) => ({
    id: c.id,
    name: c.name,
    startDate: c.start_date,
    endDate: c.end_date,
    status: c.status as CycleStatus,
  }));
}

export interface PerfResult {
  error?: string;
}

export async function createCycle(
  supabase: SupabaseClient<Database>,
  companyId: string,
  input: { name: string; startDate: string; endDate: string },
): Promise<PerfResult> {
  const { error } = await supabase.from("review_cycles").insert({
    company_id: companyId,
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    status: "active",
  });
  return error ? { error: error.message } : {};
}

// ── Goals ────────────────────────────────────────────────────────────────────

const GOAL_SELECT =
  "id, employee_id, title, description, weight, progress, status, employees(full_name)";

/** Goals for a cycle (company-wide; manager queue). */
export async function getCycleGoals(
  supabase: SupabaseClient<Database>,
  companyId: string,
  cycleId: string,
): Promise<GoalView[]> {
  const { data } = await supabase
    .from("performance_goals")
    .select(GOAL_SELECT)
    .eq("company_id", companyId)
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: true });
  return ((data as unknown as GoalRow[] | null) ?? []).map(toGoalView);
}

/** The signed-in employee's own goals (mobile self-service). */
export async function getEmployeeGoals(
  supabase: SupabaseClient<Database>,
  employeeId: string,
): Promise<GoalView[]> {
  const { data } = await supabase
    .from("performance_goals")
    .select(GOAL_SELECT)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return ((data as unknown as GoalRow[] | null) ?? []).map(toGoalView);
}

function toGoalView(g: GoalRow): GoalView {
  return {
    id: g.id,
    employeeId: g.employee_id,
    employeeName: g.employees?.full_name ?? "—",
    title: g.title,
    description: g.description,
    weight: g.weight,
    progress: g.progress,
    status: g.status,
  };
}

export async function createGoal(
  supabase: SupabaseClient<Database>,
  companyId: string,
  input: {
    employeeId: string;
    cycleId: string | null;
    title: string;
    description?: string;
    weight: number;
  },
): Promise<PerfResult> {
  const { error } = await supabase.from("performance_goals").insert({
    company_id: companyId,
    employee_id: input.employeeId,
    cycle_id: input.cycleId,
    title: input.title,
    description: input.description ?? null,
    weight: input.weight,
  });
  return error ? { error: error.message } : {};
}

/** Update a goal's progress (and derived status). Manager or the owning employee. */
export async function updateGoalProgress(
  supabase: SupabaseClient<Database>,
  goalId: string,
  progress: number,
  status?: GoalStatus,
): Promise<PerfResult> {
  const patch: Database["public"]["Tables"]["performance_goals"]["Update"] = {
    progress,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  const { error } = await supabase.from("performance_goals").update(patch).eq("id", goalId);
  return error ? { error: error.message } : {};
}

// ── Reviews ──────────────────────────────────────────────────────────────────

const REVIEW_SELECT = "id, employee_id, overall_rating, summary, status, employees(full_name)";

export async function getCycleReviews(
  supabase: SupabaseClient<Database>,
  companyId: string,
  cycleId: string,
): Promise<ReviewView[]> {
  const { data } = await supabase
    .from("performance_reviews")
    .select(REVIEW_SELECT)
    .eq("company_id", companyId)
    .eq("cycle_id", cycleId);
  return ((data as unknown as ReviewRow[] | null) ?? []).map(toReviewView);
}

export async function getEmployeeReviews(
  supabase: SupabaseClient<Database>,
  employeeId: string,
): Promise<ReviewView[]> {
  const { data } = await supabase
    .from("performance_reviews")
    .select(REVIEW_SELECT)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return ((data as unknown as ReviewRow[] | null) ?? []).map(toReviewView);
}

function toReviewView(r: ReviewRow): ReviewView {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employees?.full_name ?? "—",
    overallRating: r.overall_rating,
    summary: r.summary,
    status: r.status,
  };
}

/** Create or update the draft review for (cycle, employee). RLS: manager/admin/owner. */
export async function saveReviewDraft(
  supabase: SupabaseClient<Database>,
  companyId: string,
  input: { cycleId: string; employeeId: string; overallRating: number; summary?: string },
): Promise<PerfResult> {
  const { error } = await supabase.from("performance_reviews").upsert(
    {
      company_id: companyId,
      cycle_id: input.cycleId,
      employee_id: input.employeeId,
      overall_rating: input.overallRating,
      summary: input.summary ?? null,
      status: "draft",
    },
    { onConflict: "cycle_id,employee_id" },
  );
  return error ? { error: error.message } : {};
}

/** Submit a draft review (draft → submitted). RPC asserts manager/admin/owner + audits. */
export async function submitReview(
  supabase: SupabaseClient<Database>,
  reviewId: string,
): Promise<PerfResult> {
  const { error } = await supabase.rpc("submit_review", { p_review_id: reviewId });
  return error ? { error: error.message } : {};
}

/** Acknowledge a submitted review (the reviewee). RPC asserts caller is the employee + audits. */
export async function acknowledgeReview(
  supabase: SupabaseClient<Database>,
  reviewId: string,
): Promise<PerfResult> {
  const { error } = await supabase.rpc("acknowledge_review", { p_review_id: reviewId });
  return error ? { error: error.message } : {};
}
