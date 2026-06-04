import "server-only";
import type { Database } from "@nexis/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPeriod } from "./payroll-format";
import type { ReportType, ReportJobStatus } from "./reports-format";

export type { ReportType, ReportJobStatus, ReportTypeMeta } from "./reports-format";
export { REPORT_TYPES, reportTypeLabel } from "./reports-format";

export interface ReportJobView {
  id: string;
  reportType: ReportType;
  status: ReportJobStatus;
  outputPath: string | null;
  errorMessage: string | null;
  createdAt: string;
  /** Period label resolved from the payroll run referenced in `parameters`. */
  periodLabel: string | null;
}

interface RawJobRow {
  id: string;
  report_type: string;
  status: string;
  output_path: string | null;
  error_message: string | null;
  created_at: string;
  parameters: Database["public"]["Tables"]["report_jobs"]["Row"]["parameters"];
}

/** A completed payroll run, used to populate the report run picker. */
export interface RunOption {
  id: string;
  periodLabel: string;
}

/**
 * Completed/paid payroll runs for the company, newest first. Reports are derived
 * from a finalized run's payroll_items, so only these runs are selectable.
 */
export async function getReportableRuns(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<RunOption[]> {
  const { data } = await supabase
    .from("payroll_runs")
    .select("id, period_year, period_month")
    .eq("company_id", companyId)
    .in("status", ["completed", "paid"])
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  return ((data as { id: string; period_year: number; period_month: number }[] | null) ?? []).map(
    (r) => ({ id: r.id, periodLabel: formatPeriod(r.period_year, r.period_month) }),
  );
}

/** Recent report jobs for the company, newest first. RLS restricts to owner/admin/manager. */
export async function getReportJobs(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<ReportJobView[]> {
  const { data } = await supabase
    .from("report_jobs")
    .select("id, report_type, status, output_path, error_message, created_at, parameters")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data as RawJobRow[] | null) ?? [];

  // Resolve the period label for each job from the run id in its parameters.
  const runIds = Array.from(
    new Set(
      rows
        .map((r) => extractRunId(r.parameters))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const periodByRun = new Map<string, string>();
  if (runIds.length > 0) {
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("id, period_year, period_month")
      .in("id", runIds);
    for (const run of (runs as { id: string; period_year: number; period_month: number }[] | null) ?? []) {
      periodByRun.set(run.id, formatPeriod(run.period_year, run.period_month));
    }
  }

  return rows.map((r) => {
    const runId = extractRunId(r.parameters);
    return {
      id: r.id,
      reportType: r.report_type as ReportType,
      status: r.status as ReportJobStatus,
      outputPath: r.output_path,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      periodLabel: runId ? periodByRun.get(runId) ?? null : null,
    };
  });
}

/** Pull the payroll run id out of a job's `parameters` jsonb (worker accepts either key). */
function extractRunId(
  parameters: Database["public"]["Tables"]["report_jobs"]["Row"]["parameters"],
): string | null {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return null;
  const p = parameters as Record<string, unknown>;
  const value = p.payrollRunId ?? p.payroll_run_id;
  return typeof value === "string" ? value : null;
}

/** Short-lived signed URL for a finished report in the private `reports` bucket. */
export async function getReportSignedUrl(
  supabase: SupabaseClient<Database>,
  outputPath: string,
): Promise<string | null> {
  const { data } = await supabase.storage.from("reports").createSignedUrl(outputPath, 60);
  return data?.signedUrl ?? null;
}
