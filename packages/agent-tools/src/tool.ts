import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import type { z } from "zod";
import { approvalPayloadHash } from "./approval";
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
   * Approval token for mutations flagged `requiresApproval`: the id of an
   * `approval_requests` row the owner has approved (ADR 0002). The executor
   * verifies AND consumes it atomically via the `consume_approval` RPC —
   * tokens are single-use and bound to the exact input payload by hash.
   */
  approvalToken?: string;
  /**
   * Injected infrastructure capabilities (ADR 0003). Tools that need an
   * effect beyond the database call these; the caller decides how the
   * environment provides them (web app wires Cloud Tasks, tests wire stubs).
   * A tool requiring an absent capability halts — it never guesses.
   */
  effects?: {
    /** Hand a queued run to the payroll worker (apps/web/lib/payroll-worker.ts). */
    enqueuePayrollRun?: (runId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  };
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
 * RLS: "audit_logs: agent tool insert" (20260704020000_agent_approvals.sql)
 * permits exactly these rows — entity 'agent_tools', own company, own actor.
 */
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

  if (tool.requiresApproval) {
    if (!ctx.approvalToken) {
      return finalize(
        {
          status: "denied",
          reason: `Tool "${tool.name}" mutates state and requires an approval token.`,
        },
        parsed.data,
      );
    }

    // Verify + consume atomically (ADR 0002): the RPC only returns true when
    // the request is approved, unexpired, for this tool, and its stored hash
    // matches the hash of the input we are about to execute.
    const payloadHash = await approvalPayloadHash(tool.name, parsed.data);
    try {
      const { data: consumed, error } = await ctx.supabase.rpc("consume_approval", {
        request_id: ctx.approvalToken,
        tool_name: tool.name,
        payload_hash: payloadHash,
      });
      if (error) {
        return finalize(
          { status: "denied", reason: `Approval verification failed: ${error.message}` },
          parsed.data,
        );
      }
      if (consumed !== true) {
        return finalize(
          {
            status: "denied",
            reason:
              "Approval token rejected: not approved, expired, already consumed, or payload changed since approval.",
          },
          parsed.data,
        );
      }
    } catch (err) {
      return finalize(
        {
          status: "denied",
          reason: `Approval verification failed: ${err instanceof Error ? err.message : "unexpected error"}`,
        },
        parsed.data,
      );
    }
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
