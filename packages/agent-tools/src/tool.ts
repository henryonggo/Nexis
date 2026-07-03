import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import type { z } from "zod";
import type { HaltReason, ToolAudit, ToolResult, ToolStatus } from "./result";

/**
 * Execution context for one tool call. The Supabase client MUST be an
 * RLS-scoped client authenticated as a tenant user — agents get no bypass
 * (docs/pivot/PIVOT-PHASE-1.md, "What stays"). Never pass a service-role
 * client here.
 */
export interface ToolContext {
  supabase: SupabaseClient<Database>;
  /** Active company the agent is operating for (RLS still enforces access). */
  companyId: string;
  /** Auth user id the agent acts on behalf of; goes to audit_logs.actor_id. */
  actorId: string | null;
  /**
   * Opaque approval token for mutations flagged `requiresApproval`.
   * Week 1 only gates on presence; verification (signature, scope, expiry)
   * is the Week 2 approval-token mechanism.
   */
  approvalToken?: string;
}

/** What a tool's `run` returns before the executor wraps it. */
export type ToolOutcome<Out> = { data: Out } | { halt: HaltReason[] };

export interface ToolDefinition<In, Out> {
  /** Snake-case identifier, unique in the registry (e.g. "fetch_employee_roster"). */
  name: string;
  /** One-line description shown to the orchestrator model. */
  description: string;
  /** Mutations must be flagged; the executor refuses them without a token. */
  requiresApproval: boolean;
  // Third param `any`: schemas with .default()/.transform() accept a wider
  // input type than they output, and the executor only ever feeds `unknown`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: z.ZodType<In, z.ZodTypeDef, any>;
  run(input: In, ctx: ToolContext): Promise<ToolOutcome<Out>>;
}

/** Identity helper so tool modules get full inference without annotations. */
export function defineTool<In, Out>(tool: ToolDefinition<In, Out>): ToolDefinition<In, Out> {
  return tool;
}

function summarizeHalt(reasons: HaltReason[]): string {
  return reasons.map((r) => r.code).join(",");
}

/**
 * Best-effort audit insert. Failure never fails the tool call — the result
 * carries `audit.recorded: false` so the orchestrator can escalate instead.
 */
// TODO(db): audit_logs needs an INSERT policy permitting company members to
// write rows with entity = 'agent_tools' (agent executions must be auditable
// under RLS, no service role) — db-engineer.
async function recordAudit(ctx: ToolContext, audit: ToolAudit): Promise<ToolAudit> {
  try {
    const { error } = await ctx.supabase.from("audit_logs").insert({
      action: audit.action,
      entity: "agent_tools",
      entity_id: null,
      company_id: audit.companyId,
      actor_id: audit.actorId,
      metadata: {
        status: audit.status,
        input: audit.input as never,
        detail: audit.detail,
      },
    });
    if (error) return { ...audit, recorded: false, recordError: error.message };
    return { ...audit, recorded: true };
  } catch (err) {
    return {
      ...audit,
      recorded: false,
      recordError: err instanceof Error ? err.message : "unknown audit failure",
    };
  }
}

/**
 * Run a tool with the full guard rail sequence: validate input → enforce the
 * approval gate → execute → build + persist the audit entry. Every path,
 * including validation failures, produces an audit record.
 */
export async function executeTool<In, Out>(
  tool: ToolDefinition<In, Out>,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult<Out>> {
  const action = `agent_tool.${tool.name}`;

  const finalize = async <T>(
    partial:
      | { status: "ok"; data: T }
      | { status: "halt"; reasons: HaltReason[] }
      | { status: "denied"; reason: string }
      | { status: "error"; message: string },
    input: unknown,
  ): Promise<ToolResult<T>> => {
    const status: ToolStatus = partial.status;
    const detail =
      partial.status === "halt"
        ? summarizeHalt(partial.reasons)
        : partial.status === "denied"
          ? partial.reason
          : partial.status === "error"
            ? partial.message
            : null;
    const audit = await recordAudit(ctx, {
      action,
      companyId: ctx.companyId,
      actorId: ctx.actorId,
      status,
      input,
      detail,
      recorded: false,
    });
    return { ...partial, audit } as ToolResult<T>;
  };

  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return finalize({ status: "error", message: `Invalid input — ${issues}` }, rawInput);
  }

  if (tool.requiresApproval && !ctx.approvalToken) {
    return finalize(
      {
        status: "denied",
        reason: `Tool "${tool.name}" mutates state and requires an approval token.`,
      },
      parsed.data,
    );
  }

  try {
    const outcome = await tool.run(parsed.data, ctx);
    if ("halt" in outcome) {
      return finalize({ status: "halt", reasons: outcome.halt }, parsed.data);
    }
    return finalize({ status: "ok", data: outcome.data }, parsed.data);
  } catch (err) {
    return finalize(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Unexpected tool failure",
      },
      parsed.data,
    );
  }
}
