/**
 * @nexis/agent-tools — typed, auditable tool layer for the Nexis agent runtime.
 *
 * Every tool wraps an existing domain operation behind the Supabase seam:
 * input validated by schema, execution RLS-scoped via an injected tenant
 * client (never service-role), structured ok/halt/denied/error result, and an
 * audit_logs entry per call. Mutating tools are flagged `requiresApproval`
 * and refuse to run without an approval token.
 *
 * See docs/pivot/PIVOT-PHASE-1.md and docs/adr/0001-agent-architecture-phase-1.md.
 */

export type {
  HaltReason,
  ToolAudit,
  ToolDenied,
  ToolError,
  ToolHalt,
  ToolOk,
  ToolResult,
  ToolStatus,
} from "./result";
export {
  defineTool,
  executeTool,
  type ToolContext,
  type ToolDefinition,
  type ToolOutcome,
} from "./tool";
export { approvalPayloadHash, canonicalJson } from "./approval";

export {
  fetchEmployeeRoster,
  type RosterLine,
  type RosterOutput,
} from "./tools/fetch-employee-roster";
export {
  computePph21ForEmployee,
  type EarningLineOut,
  type Pph21Output,
} from "./tools/compute-pph21";
export { computePayrollRun, type PayrollRunOutput } from "./tools/compute-payroll-run";
export { type StatutoryLine } from "./tools/statutory";

import { fetchEmployeeRoster } from "./tools/fetch-employee-roster";
import { computePph21ForEmployee } from "./tools/compute-pph21";
import { computePayrollRun } from "./tools/compute-payroll-run";
import type { ToolDefinition } from "./tool";

/** Registry the orchestrator exposes to the model. Names are unique. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AGENT_TOOLS: readonly ToolDefinition<any, any>[] = [
  fetchEmployeeRoster,
  computePph21ForEmployee,
  computePayrollRun,
];
