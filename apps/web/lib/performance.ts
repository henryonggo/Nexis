import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";

/**
 * Performance & KPI — Stage 7.
 *
 * TODO(db): blocked on Antigravity landing the schema in
 * docs/handoff/stage-07-performance.md. Until the migration + `pnpm db:types`
 * land, the generated `Database` type has no `review_cycles` /
 * `performance_goals` / `performance_reviews` tables, the `goal_status` /
 * `review_status` enums, or the `submit_review` / `acknowledge_review` RPCs, so
 * all Supabase access here goes through `perfDb()` — a single typed cast that
 * quarantines the gap. When the types regen, delete `perfDb` + the local row
 * interfaces and point these queries at the generated types (and remove this note).
 */

export type CycleStatus = "draft" | "active" | "closed";
export type GoalStatus = "on_track" | "at_risk" | "off_track" | "done" | "cancelled";
export type ReviewStatus = "draft" | "submitted" | "acknowledged";

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

interface RawCycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: CycleStatus;
}

interface RawGoal {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  weight: number;
  progress: number;
  status: GoalStatus;
  employees: { full_name: string } | null;
}

interface RawReview {
  id: string;
  employee_id: string;
  overall_rating: number | null;
  summary: string | null;
  status: ReviewStatus;
  employees: { full_name: string } | null;
}

/**
 * The single quarantined cast for this not-yet-generated feature. Everything else
 * in this module stays fully typed against the interfaces above. Delete once
 * `packages/types` includes the performance tables/RPCs (TODO(db)).
 */
function perfDb(supabase: SupabaseClient<Database>) {
  return supabase as unknown as SupabaseClient<any>;
}

// ── Cycles ───────────────────────────────────────────────────────────────────

/** Review cycles for the company, newest first. RLS scopes to company members. */
export async function getCycles(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<CycleView[]> {
  const { data } = await perfDb(supabase)
    .from("review_cycles")
    .select("id, name, start_date, end_date, status")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  return ((data as RawCycle[] | null) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    startDate: c.start_date,
    endDate: c.end_date,
    status: c.status,
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
  const { error } = await perfDb(supabase).from("review_cycles").insert({
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
  const { data } = await perfDb(supabase)
    .from("performance_goals")
    .select(GOAL_SELECT)
    .eq("company_id", companyId)
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: true });
  return ((data as RawGoal[] | null) ?? []).map(toGoalView);
}

/** The signed-in employee's own goals (mobile self-service). */
export async function getEmployeeGoals(
  supabase: SupabaseClient<Database>,
  employeeId: string,
): Promise<GoalView[]> {
  const { data } = await perfDb(supabase)
    .from("performance_goals")
    .select(GOAL_SELECT)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return ((data as RawGoal[] | null) ?? []).map(toGoalView);
}

function toGoalView(g: RawGoal): GoalView {
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
  const { error } = await perfDb(supabase).from("performance_goals").insert({
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
  const patch: Record<string, unknown> = {
    progress,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  const { error } = await perfDb(supabase)
    .from("performance_goals")
    .update(patch)
    .eq("id", goalId);
  return error ? { error: error.message } : {};
}

// ── Reviews ──────────────────────────────────────────────────────────────────

const REVIEW_SELECT = "id, employee_id, overall_rating, summary, status, employees(full_name)";

export async function getCycleReviews(
  supabase: SupabaseClient<Database>,
  companyId: string,
  cycleId: string,
): Promise<ReviewView[]> {
  const { data } = await perfDb(supabase)
    .from("performance_reviews")
    .select(REVIEW_SELECT)
    .eq("company_id", companyId)
    .eq("cycle_id", cycleId);
  return ((data as RawReview[] | null) ?? []).map(toReviewView);
}

export async function getEmployeeReviews(
  supabase: SupabaseClient<Database>,
  employeeId: string,
): Promise<ReviewView[]> {
  const { data } = await perfDb(supabase)
    .from("performance_reviews")
    .select(REVIEW_SELECT)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return ((data as RawReview[] | null) ?? []).map(toReviewView);
}

function toReviewView(r: RawReview): ReviewView {
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
  const { error } = await perfDb(supabase).from("performance_reviews").upsert(
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
  const { error } = await perfDb(supabase).rpc("submit_review", { p_review_id: reviewId });
  return error ? { error: error.message } : {};
}

/** Acknowledge a submitted review (the reviewee). RPC asserts caller is the employee + audits. */
export async function acknowledgeReview(
  supabase: SupabaseClient<Database>,
  reviewId: string,
): Promise<PerfResult> {
  const { error } = await perfDb(supabase).rpc("acknowledge_review", { p_review_id: reviewId });
  return error ? { error: error.message } : {};
}
