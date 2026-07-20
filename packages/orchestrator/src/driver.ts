import {
  approvalPayloadHash,
  canonicalJson,
  createApprovalRequest,
  executeTool,
  findConsumableApprovalRequest,
  findPendingApprovalRequest,
  AGENT_TOOLS,
  type ToolContext,
} from "@nexis/agent-tools";
import type { HaltReason } from "@nexis/agent-tools";
import { toAnthropicTools } from "./tool-adapter";
import type { CycleResult, OrchestratorEvent } from "./events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = import("@nexis/agent-tools").ToolDefinition<any, any>;

/**
 * The payroll-cycle driver (ADR 0004): a manual Anthropic tool-use loop over
 * the AGENT_TOOLS registry. Manual — not the SDK tool runner — because the
 * approval gate must interrupt the loop: a denied requires_approval call
 * opens an approval_requests row and PAUSES the cycle for /approvals; a halt
 * ends the cycle with an owner task list. Stateless per invocation; durable
 * state lives in approval_requests + payroll_runs.
 */

// Minimal structural view of the Anthropic client — `new Anthropic()`
// satisfies it. Kept structural so tests inject a scripted fake and the
// package stays runnable against future SDK versions.
export interface ModelTextBlock {
  type: "text";
  text: string;
}
export interface ModelToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
export type ModelContentBlock =
  | ModelTextBlock
  | ModelToolUseBlock
  | { type: string; [key: string]: unknown };

export interface ModelResponse {
  stop_reason: string | null;
  content: ModelContentBlock[];
  stop_details?: { category?: string | null; explanation?: string | null } | null;
}

export interface ModelClient {
  beta: {
    messages: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create(params: Record<string, any>): Promise<ModelResponse>;
    };
  };
}

/**
 * Stable system prompt (cacheable prefix — keep frozen; per-cycle context
 * goes in the user turn). Encodes the pivot ground rules the model must obey.
 */
const SYSTEM_PROMPT = `You are the Nexis payroll orchestrator for an Indonesian SME. You run
back-office payroll workflows through typed tools; a human owner approves
every mutation on the /approvals queue. Ground rules (non-negotiable):

1. Payroll numbers are NEVER estimated. Tools halt when an input is missing —
   when that happens, do not retry or guess: summarize every blocker for the
   owner as a short task list and end your turn.
2. All money is integer rupiah. Never invent or round amounts yourself; only
   report numbers exactly as tools return them.
3. When a mutating tool responds with status "awaiting_approval", an approval
   request has been opened for the owner. Tell the owner what was proposed and
   that it awaits their decision on the Persetujuan page, then end your turn.
   Do not call the same mutating tool again in this cycle.
4. Read before you write: compute_payroll_run before create_draft_payroll_run,
   so the owner approves numbers you have already shown.
5. Write final, owner-facing summaries in Indonesian (id-ID). Keep them short:
   the outcome first, then any actions needed from the owner.`;

export interface CycleOptions {
  client: ModelClient;
  /** RLS-scoped tool execution context (no approvalToken — see approvalTokens). */
  toolContext: Omit<ToolContext, "approvalToken">;
  /** The kickoff instruction, e.g. "Jalankan siklus payroll Juli 2026." */
  instruction: string;
  /**
   * @deprecated Hint only. Discovery by payload hash (`findConsumableApprovalRequest`,
   * NEXT-3) is authoritative and resolves same-named proposals correctly
   * regardless of call order; this Record<toolName, requestId> has only one
   * slot per tool name, so it cannot disambiguate two same-named proposals.
   * Kept as a fallback because apps/web still sends it.
   */
  approvalTokens?: Record<string, string>;
  tools?: readonly AnyTool[];
  model?: string;
  /** Refusal fallback model (ADR 0004 / Fable 5 guidance); null disables. */
  fallbackModel?: string | null;
  maxTurns?: number;
  onEvent?: (event: OrchestratorEvent) => void;
}

export async function runPayrollCycle(options: CycleOptions): Promise<CycleResult> {
  const {
    client,
    toolContext,
    instruction,
    tools = AGENT_TOOLS,
    model = "claude-fable-5",
    fallbackModel = "claude-opus-4-8",
    maxTurns = 12,
    onEvent,
  } = options;
  const approvalTokens = { ...(options.approvalTokens ?? {}) };

  const events: OrchestratorEvent[] = [];
  const halts: HaltReason[] = [];
  const pendingApprovals: CycleResult["pendingApprovals"] = [];
  let finalText = "";
  const emit = (event: OrchestratorEvent) => {
    events.push(event);
    onEvent?.(event);
  };
  const toolByName = new Map(tools.map((t) => [t.name, t] as const));
  const anthropicTools = toAnthropicTools(tools);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: Record<string, any>[] = [{ role: "user", content: instruction }];

  for (let turn = 0; turn < maxTurns; turn++) {
    let response: ModelResponse;
    try {
      response = await client.beta.messages.create({
        model,
        max_tokens: 16_000,
        // Fable 5: thinking is always on — the `thinking` param must be omitted.
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        tools: anthropicTools,
        messages,
        ...(fallbackModel
          ? {
              betas: ["server-side-fallback-2026-06-01"],
              fallbacks: [{ model: fallbackModel }],
            }
          : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "model request failed";
      emit({ type: "error", message });
      return { status: "error", finalText, events, halts, pendingApprovals };
    }

    for (const block of response.content) {
      if (block.type === "text") {
        const text = (block as ModelTextBlock).text;
        if (text) {
          finalText = text;
          emit({ type: "model_text", text });
        }
      }
    }

    // A refusal (with the whole fallback chain declined) surfaces to the
    // owner; content may be empty or partial — discard partials.
    if (response.stop_reason === "refusal") {
      emit({ type: "refusal", detail: response.stop_details?.explanation ?? null });
      return { status: "refusal", finalText, events, halts, pendingApprovals };
    }

    // Echo the full assistant content back (thinking blocks included, per
    // Fable 5 replay rules).
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter(
      (b): b is ModelToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      if (response.stop_reason === "max_tokens") {
        emit({ type: "error", message: "Model output truncated (max_tokens)." });
        return { status: "error", finalText, events, halts, pendingApprovals };
      }
      const status = pendingApprovals.length > 0
        ? "awaiting_approval"
        : halts.length > 0
          ? "halted"
          : "completed";
      return { status, finalText, events, halts, pendingApprovals };
    }

    // Execute every tool call in the batch; ALL results go back in ONE user
    // message (parallel tool-use contract).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: Record<string, any>[] = [];
    for (const call of toolUses) {
      emit({ type: "tool_call", tool: call.name, input: call.input });
      const tool = toolByName.get(call.name);
      if (!tool) {
        emit({ type: "tool_result", tool: call.name, status: "error", detail: "unknown tool" });
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Unknown tool "${call.name}".`,
          is_error: true,
        });
        continue;
      }

      // Approval-gated tools: parse once — the same payload feeds the hash
      // lookup below, a freshly opened approval_requests row (denied path),
      // and (via executeTool, which re-parses call.input itself) the run.
      let approvalToken: string | undefined;
      let payload: unknown = call.input;
      let payloadHash: string | undefined;
      if (tool.requiresApproval) {
        const parsed = tool.input.safeParse(call.input);
        payload = parsed.success ? parsed.data : call.input;
        payloadHash = await approvalPayloadHash(call.name, payload);

        // Resolve by payload hash first (NEXT-3): the oldest APPROVED
        // request that authorizes this exact call, regardless of call order
        // or how many same-named proposals are in flight. Falls back to the
        // legacy tool-name slot only if no hash match is found.
        const consumable = await findConsumableApprovalRequest({
          supabase: toolContext.supabase,
          companyId: toolContext.companyId,
          toolName: call.name,
          payloadHash,
        });
        approvalToken = consumable?.requestId;
        if (!approvalToken) {
          approvalToken = approvalTokens[call.name];
          if (approvalToken) delete approvalTokens[call.name];
        }
      }

      const result = await executeTool(tool, call.input, { ...toolContext, approvalToken });

      switch (result.status) {
        case "ok": {
          emit({ type: "tool_result", tool: call.name, status: "ok", detail: null });
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify({ status: "ok", data: result.data }),
          });
          break;
        }
        case "halt": {
          halts.push(...result.reasons);
          const codes = result.reasons.map((r) => r.code).join(",");
          emit({ type: "tool_result", tool: call.name, status: "halt", detail: codes });
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify({ status: "halt", reasons: result.reasons }),
          });
          break;
        }
        case "denied": {
          emit({ type: "tool_result", tool: call.name, status: "denied", detail: result.reason });
          if (tool.requiresApproval && !approvalToken) {
            const summary = `Agen mengusulkan ${call.name}: ${canonicalJson(payload)}`;
            // A same-named, same-payload request may already be pending
            // (e.g. this call was proposed earlier and the owner hasn't
            // decided yet) — reuse it instead of opening a duplicate row.
            const pending = await findPendingApprovalRequest({
              supabase: toolContext.supabase,
              companyId: toolContext.companyId,
              toolName: call.name,
              payloadHash: payloadHash!,
            });
            const request = pending
              ? { ok: true as const, requestId: pending.requestId }
              : await createApprovalRequest({
                  supabase: toolContext.supabase,
                  companyId: toolContext.companyId,
                  toolName: call.name,
                  payload,
                  summary,
                });
            if (request.ok) {
              pendingApprovals.push({ requestId: request.requestId, tool: call.name, summary });
              emit({
                type: "approval_requested",
                tool: call.name,
                requestId: request.requestId,
                summary,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: JSON.stringify({
                  status: "awaiting_approval",
                  requestId: request.requestId,
                  note: "Approval request opened for the owner on /approvals. Stop and report.",
                }),
              });
            } else {
              emit({ type: "approval_request_failed", tool: call.name, error: request.error });
              toolResults.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: `Could not open an approval request: ${request.error}`,
                is_error: true,
              });
            }
          } else {
            // Token was present but rejected (expired/consumed/hash mismatch).
            toolResults.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: `Approval rejected: ${result.reason}`,
              is_error: true,
            });
          }
          break;
        }
        case "error": {
          emit({ type: "tool_result", tool: call.name, status: "error", detail: result.message });
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: result.message,
            is_error: true,
          });
          break;
        }
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  emit({ type: "error", message: `Cycle exceeded ${maxTurns} turns.` });
  return { status: "max_turns", finalText, events, halts, pendingApprovals };
}
