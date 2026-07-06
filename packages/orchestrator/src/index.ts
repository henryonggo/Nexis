/**
 * @nexis/orchestrator — the agent runtime (ADR 0004).
 *
 * A stateless payroll-cycle driver: Fable 5 tool-use loop over the
 * @nexis/agent-tools registry, run server-side by apps/web. Durable state
 * lives in approval_requests + payroll_runs; halts become owner task lists;
 * denied mutations open approval requests and pause the cycle for /approvals.
 */

export {
  runPayrollCycle,
  type CycleOptions,
  type ModelClient,
  type ModelContentBlock,
  type ModelResponse,
  type ModelTextBlock,
  type ModelToolUseBlock,
} from "./driver";
export { toAnthropicTools, type AnthropicToolParam } from "./tool-adapter";
export type { CycleResult, OrchestratorEvent } from "./events";
