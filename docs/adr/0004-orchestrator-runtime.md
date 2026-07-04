# ADR 0004 — Orchestrator runtime shape (packages/orchestrator)

- **Status:** Proposed (drafted 2026-07-04; awaiting owner review — no code
  until accepted)
- **Context:** `docs/pivot/PIVOT-PHASE-1.md` ("What changes"), ADRs 0001–0003,
  `packages/agent-tools` (tool registry + executor, complete)
- **Deciders:** Owner (Boss); drafted by Claude Code (Fable 5)

## Context

The tool layer is done: seven typed tools behind one executor, approval
tokens live end-to-end, and the approval gate UI exists. What remains for the
Week 3 dry run is the runtime that *drives* them: plan a payroll cycle, call
tools, surface halts and proposals, stop when done. Decisions needed before
code:

1. **Where does the orchestrator run?**
2. **What model + SDK loop drives it?**
3. **How do halts and approvals flow back to the owner?**

## Proposal

**Runtime location: a Node entrypoint invoked server-side (Next.js route
handler / server action in `apps/web`), not an Edge Function.** The
orchestrator needs the tenant user's RLS-scoped Supabase client (same session
as the operator who kicked off the cycle), the `enqueuePayrollRun` effect
(ADR 0003), and the Anthropic API key — all already available server-side in
the web app. Supabase Edge Functions sit in the db lane and would duplicate
env/config; a separate service is overkill for one workflow.

**Loop: Anthropic SDK tool-use loop, Fable 5 as orchestrator model
(per ADR 0001).** `packages/orchestrator` exports a pure driver:

```
runPayrollCycle(ctx: {
  anthropic, supabase, companyId, actorId, effects,
  onEvent: (e: OrchestratorEvent) => void,
}) → CycleResult
```

- Tool definitions are generated from `AGENT_TOOLS` (name, description, zod
  schema → JSON schema). The driver never defines behavior — it adapts the
  registry.
- A `halt` result ends the turn with the reasons rendered to the owner as a
  task list; the cycle is resumable after data is fixed.
- A `denied` result for a `requires_approval` tool makes the driver call
  `createApprovalRequest(...)` and stop with "awaiting approval" — the owner
  decides on `/approvals`; a later resume re-invokes the tool with the
  approved request id as its token.
- Every event (tool call, result status, model text) appends to a
  `cycle_log` the failure log can be built from —
  `docs/pivot/failure-log.md` entries come from reviewing these.

**Session state: stateless per invocation, durable in the DB.** No in-memory
agent sessions: each invocation reconstructs context from `approval_requests`
+ `payroll_runs` status — matching how the cycle actually blocks (on human
approvals, hours or days), and surviving deploys.

## Alternatives rejected

- **CLI-driven orchestrator (Claude Code session as the runtime):** what we
  do today manually; fine for the Week 3 *dry run*, but not the product —
  customer zero shouldn't need a terminal.
- **Long-running worker service:** durable sessions we don't need (state
  lives in the DB), plus a new deploy target in `services/**` (db lane).

## Consequences / follow-ups if accepted

- `packages/orchestrator`: driver + zod→JSON-schema adapter + event types
  (domain-engineer lane; no UI, no SQL).
- `apps/web`: one route handler / action to start+resume a cycle, and a
  minimal cycle-status view or a section on `/approvals` (app-engineer lane).
- `ANTHROPIC_API_KEY` joins the web app's server env (owner: add to Vercel).
- TODO(db) candidate (NOT yet requested): a `cycle_logs` table if the event
  log should be queryable rather than file-based for the dry run.
