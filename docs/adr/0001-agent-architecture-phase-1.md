# ADR 0001 — Agent architecture for the Phase 1 pivot

- **Status:** Accepted (owner, 2026-07-03). Restructuring of `.claude/agents/`
  applied the same day.
- **Context:** `docs/pivot/PIVOT-PHASE-1.md` (Week 1 task), `.claude/agents/README.md`
- **Deciders:** Owner (Boss); drafted by Claude Code (Fable 5)

## Context

Nexis development runs as a six-subagent team under a single orchestrator
session (`.claude/agents/`):

| Agent | Model | Lane |
|---|---|---|
| architect | Opus | Plans + contracts, no code |
| db-engineer | Sonnet | Everything behind the Supabase client (ex-Antigravity lane) |
| domain-engineer | Sonnet | Pure TS: `packages/payroll`, `packages/money`, `packages/leave` |
| web-engineer | Haiku | `apps/web` (Next.js admin) |
| mobile-engineer | Haiku | `apps/mobile` (Expo employee app) |
| qa | Sonnet | Vitest + Playwright, reviews last |

That split was sized for 4.x-era model limits: a strong-but-expensive planner
(Opus) kept away from implementation, mid-size implementers per lane, small
models for high-volume UI work, and a separate QA pass to catch what the
implementers missed.

Two things changed:

1. **Fable 5 exists.** The orchestrator session itself can now plan, hold the
   whole-repo contract picture, and review diffs at a level that previously
   required the dedicated architect + qa agents.
2. **The pivot shrinks the UI surface.** Phase 1 builds no UI beyond the
   approval gate. The web/mobile lanes go from "build the whole product
   surface" to "maintain what exists + one approval view." Meanwhile two new
   pure-TS packages appear (`packages/agent-tools`, `packages/orchestrator`)
   that sit exactly on the seam the architect used to arbitrate.

### Monorepo inventory relevant to the decision (2026-07-03)

- `packages/money`, `packages/payroll`, `packages/leave` — pure TS, tested;
  `@nexis/payroll` already exposes the exact engine the agent tool layer wraps
  (`buildPayrollConfig`, `computeMonthlyPayroll`, `computeEarnedBase`,
  `computeThr`, overtime helpers). This is the moat code.
- `packages/types` — generated from the schema; sole DB contract.
- `apps/web/lib/payroll.ts` — the app-side seam: `loadPayrollConfig` (reads
  `bpjs_config` + `ter_rates` reference rows) and `computeRunPreview` (roster +
  compensation + tax_profile + attendance → engine input). The agent tools
  re-use this *pattern* (RLS-scoped reads → pure engine), not the file itself
  (it is `server-only` and Next-coupled).
- Payroll run lifecycle lives in `apps/web/app/(app)/payroll/actions.ts`
  (`createDraftRun`, `approveRun`, `markRunPaid`, `reopenRun`, `cancelRun`,
  `confirmCashPaid`) — these are the mutation candidates for Week 2 tools,
  each mapping to a `requires_approval` tool.
- `audit_logs` table exists with a generic `(action, entity, entity_id,
  actor_id, company_id, metadata)` shape — usable by agent tools as-is.
- DB RPCs already encode several approval-shaped operations
  (`approve_leave`, `approve_loan`, `mark_payroll_items_paid`,
  `get_payroll_readiness`) — the tool layer wraps, never reimplements.

## Options considered

### A. Keep the six-agent structure as-is

Pros: proven handoff protocol (R-T-C-G-F prompts, worked example on Stage 5);
no migration cost. Cons: the architect and qa agents duplicate what the Fable 5
orchestrator now does natively; Haiku web/mobile lanes are sized for a UI
volume Phase 1 explicitly forbids; every handoff re-derives context and costs
tokens; six definitions to keep consistent while the architecture itself is
pivoting.

### B. Fable 5 orchestrator + three Sonnet workers (RECOMMENDED)

Collapse **architect** and **qa** into the orchestrator; merge **web-engineer**
and **mobile-engineer** into one **app-engineer**; keep **db-engineer** and
**domain-engineer** as-is.

- **Orchestrator (Fable 5, the session itself):** plans, owns contracts and
  ADRs, reviews all diffs, runs the e2e/QA gate before merge. Absorbing QA
  into the reviewer role is safe *here* because the moat code keeps its own
  exhaustive vitest suites (domain-engineer's definition of done) and CI runs
  Playwright guard specs independently — the qa agent's marginal value was
  test *authorship*, which the implementing worker now owns per lane.
- **db-engineer (Sonnet, unchanged):** the seam survives the pivot as the
  tool-interface boundary; schema still leads, app still follows. This lane
  stays a separate agent precisely so the orchestrator never "quickly" writes
  SQL in an app-side session.
- **domain-engineer (Sonnet, unchanged, now also owns `packages/agent-tools`
  + `packages/orchestrator`):** payroll math correctness is the moat;
  a dedicated lane with exhaustive tests stays justified. The two new pure-TS
  packages fit its no-DB/no-UI charter (tools take an injected RLS-scoped
  client; they contain no SQL).
- **app-engineer (Sonnet, merged web+mobile):** Phase 1 UI work is the
  approval gate plus maintenance. One agent, one prompt, Sonnet rather than
  Haiku because volume drops but each change touches money-adjacent surfaces.

### C. Orchestrator only, no workers

Pros: zero handoff overhead. Cons: loses lane isolation — the one structural
guard that has kept SQL out of app diffs and floats out of money code; a
single context doing schema + domain + app work is exactly the failure mode
the seam exists to prevent. Rejected.

## Decision

**Option B**, pending owner sign-off. Six agents become an orchestrator plus
three workers. The R-T-C-G-F orchestration template is retained verbatim as
the prompt pattern for the three remaining worker definitions.

## Consequences

- `.claude/agents/` gets restructured (delete `architect.md`, `qa.md`; merge
  `web-engineer.md` + `mobile-engineer.md` → `app-engineer.md`; extend
  `domain-engineer.md` with the two new packages) — **only after this ADR is
  accepted**, per the pivot plan's ground rule.
- `AGENTS.md` / `docs/08-agent-boundaries.md` references to the six-agent
  split need a follow-up edit (owner-gated files).
- QA responsibilities move into (a) each worker's definition of done and
  (b) the orchestrator's pre-merge review. If the failure log shows escaped
  defects clustering after the change, re-instate a dedicated qa agent — that
  is this ADR's explicit revisit trigger.
- Token/cost profile shifts from many small handoffs to a heavier orchestrator
  context; expected net reduction given Phase 1's narrow scope.

## Revisit triggers

- Failure log (`docs/pivot/failure-log.md`) shows ≥3 defects in two weeks that
  a dedicated qa pass would plausibly have caught → re-add qa agent.
- UI scope grows back beyond the approval gate (Phase 2+) → re-split
  app-engineer into web/mobile.
