/**
 * Structured results for agent tool executions.
 *
 * The pivot's ground rule (docs/pivot/PIVOT-PHASE-1.md): payroll numbers are
 * NEVER estimated. When an input a tool needs is missing or ambiguous, the
 * tool returns `halt` with machine-readable reasons — it does not guess, and
 * it does not substitute defaults the way an interactive preview screen may.
 * The orchestrator surfaces halts to the human owner as questions.
 */

export type ToolStatus = "ok" | "halt" | "denied" | "error";

/** One reason a tool halted instead of producing a number. */
export interface HaltReason {
  /** Stable machine-readable code, e.g. "missing_tax_profile". */
  code: string;
  /** Human-readable explanation (id-ID facing copy is the orchestrator's job). */
  message: string;
  /** What would unblock this halt, when known (e.g. a table/field to fill). */
  needs?: string;
}

/** Audit record built for every execution, whether or not it reached the DB. */
export interface ToolAudit {
  /** Always "agent_tool.<tool name>". */
  action: string;
  companyId: string;
  actorId: string | null;
  status: ToolStatus;
  /** Parsed input echoed back for traceability (validated, never raw). */
  input: unknown;
  /** Halt codes / error message when status is not "ok". */
  detail: string | null;
  /** Whether the insert into audit_logs succeeded. */
  recorded: boolean;
  /** Insert failure message when recorded is false (RLS denial, network, …). */
  recordError?: string;
}

export interface ToolOk<T> {
  status: "ok";
  data: T;
  audit: ToolAudit;
}

export interface ToolHalt {
  status: "halt";
  reasons: HaltReason[];
  audit: ToolAudit;
}

/** The tool refused to run (e.g. mutation without an approval token). */
export interface ToolDenied {
  status: "denied";
  reason: string;
  audit: ToolAudit;
}

export interface ToolError {
  status: "error";
  message: string;
  audit: ToolAudit;
}

export type ToolResult<T> = ToolOk<T> | ToolHalt | ToolDenied | ToolError;
