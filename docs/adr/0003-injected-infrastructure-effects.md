# ADR 0003 — Infrastructure effects are injected capabilities, not tool dependencies

- **Status:** Accepted (owner delegated the call — "go" on the flagged
  question, 2026-07-04); implemented same day in `packages/agent-tools`
- **Context:** ADR 0002; `apps/web/app/(app)/payroll/actions.ts` (`approveRun`);
  `apps/web/lib/payroll-worker.ts` (Cloud Tasks enqueue)
- **Deciders:** Owner (Boss); decided + drafted by Claude Code (Fable 5)

## Context

`approve_run` is the one payroll-cycle mutation with a side effect beyond the
database: after the RLS-scoped `draft → queued` transition, the run must be
handed to the Cloud Run payroll worker. In the web app this is
`enqueuePayrollRun()` (Cloud Tasks client + GCP credentials), and on enqueue
failure the action rolls the run back to `draft` so approval can be retried.

The question: how does the *agent tool* version trigger processing?

## Options

**A. Tool imports the Cloud Tasks enqueue.** Rejected: `packages/agent-tools`
is a pure-TS package whose only capability is an injected RLS-scoped Supabase
client. Adding `@google-cloud/tasks` + service credentials to the package
breaks that charter, couples every consumer (tests, future mobile/edge
callers) to GCP, and puts privileged infra credentials inside the agent tool
path the pivot explicitly keeps unprivileged.

**B. Worker polls for `queued` runs.** Rejected for Phase 1: changes the
processing model for the existing UI path too, adds polling latency and a
second trigger mechanism to reason about, and requires worker-lane changes —
all to serve one caller.

**C. Effects are injected capabilities on `ToolContext` (CHOSEN).** The tool
performs the domain transition itself and calls
`ctx.effects.enqueuePayrollRun(runId)` — a function the *caller* provides.
The web app / orchestrator running server-side passes the existing
`apps/web/lib/payroll-worker.ts` implementation; tests pass a stub. If the
capability is missing or fails, the tool rolls the run back to `draft` and
halts — a run is never left `queued` with nobody coming for it.

## Decision

Option C. `ToolContext` gains an optional `effects` bag; `approve_payroll_run`
requires `effects.enqueuePayrollRun` at execution time (halts otherwise,
after rollback). This mirrors how the Supabase client is already injected:
the package defines *what* happens, callers decide *how* the environment
does it. No new infra dependencies in `packages/agent-tools`.

## Consequences

- The orchestrator's runtime (or the approval-gate server action that
  re-invokes an approved tool) must wire `enqueuePayrollRun` from
  `apps/web/lib/payroll-worker.ts` — an app-engineer task when the
  re-invocation path lands.
- DB business gates raised by `enforce_payroll_run_gating`
  (`PLAN_GATE_FREE`, `NPWP_REQUIRED`) surface as structured halts, not
  opaque errors.
- Future effectful tools (e.g. BPJS submission upload) follow the same
  pattern: add a named capability to `effects`, halt when absent.
