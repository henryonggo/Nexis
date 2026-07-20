import type { HaltReason } from "@nexis/agent-tools";

/**
 * Events emitted while a cycle runs (ADR 0004). The caller's `onEvent` sink
 * receives every one; they are also collected onto the CycleResult. This is
 * the raw material for docs/pivot/failure-log.md — every wrong tool call,
 * halt, or refusal is visible here.
 */
export type OrchestratorEvent =
  | { type: "model_text"; text: string }
  | { type: "tool_call"; tool: string; input: unknown }
  | {
      type: "tool_result";
      tool: string;
      status: "ok" | "halt" | "denied" | "error";
      /** Halt codes / denial reason / error message; null on ok. */
      detail: string | null;
    }
  | { type: "approval_requested"; tool: string; requestId: string; summary: string }
  | { type: "approval_request_failed"; tool: string; error: string }
  | { type: "refusal"; detail: string | null }
  | { type: "error"; message: string };

export interface CycleResult {
  status: "completed" | "awaiting_approval" | "halted" | "refusal" | "max_turns" | "error";
  /** The model's final user-facing text (id-ID), if any. */
  finalText: string;
  events: OrchestratorEvent[];
  /** Halt reasons collected across the cycle (owner task list). */
  halts: HaltReason[];
  /** Approval requests opened this cycle; resume once the owner decides. */
  pendingApprovals: { requestId: string; tool: string; summary: string }[];
  /** Whether the `agent_cycles` audit row for this cycle was persisted. */
  recorded: boolean;
}
