import { formatPeriod } from "@/lib/payroll-format";

/**
 * The only approval-gated tools today take `{ year, month }`
 * (create_draft_payroll_run) or `{ runId }` (the run-lifecycle tools) —
 * packages/agent-tools/src/tools/{create-draft-payroll-run,run-lifecycle}.ts.
 * Neither payload carries money, so there is nothing to format with
 * `formatRupiah` here (that stays a fallback for a genuine money field if one
 * is ever added).
 */
const RUN_ID_TOOLS = new Set(["approve_payroll_run", "cancel_payroll_run", "mark_payroll_run_paid"]);

/** True for tools whose readable payload line is just a compact run id. */
export function isRunIdPayload(toolName: string): boolean {
  return RUN_ID_TOOLS.has(toolName);
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * One human-readable line for an `approval_requests.payload` (jsonb —
 * `unknown` here), keyed by `tool_name`. Any tool we don't recognize, or a
 * payload that doesn't match the shape we expect, falls back to the raw JSON
 * string — this never throws, and the card always has something to show.
 */
export function describePayload(toolName: string, payload: unknown, t: Translate): string {
  const raw = JSON.stringify(payload, null, 2);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return raw;
  const p = payload as Record<string, unknown>;

  if (
    toolName === "create_draft_payroll_run" &&
    typeof p.year === "number" &&
    typeof p.month === "number"
  ) {
    return t("payloadDescription.createDraftPayrollRun", { period: formatPeriod(p.year, p.month) });
  }

  if (isRunIdPayload(toolName) && typeof p.runId === "string") {
    return t("payloadDescription.runId", { runId: truncateRunId(p.runId) });
  }

  return raw;
}

function truncateRunId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
