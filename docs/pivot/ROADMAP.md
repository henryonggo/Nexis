# Nexis Roadmap

**Status: ACTIVE** (updated 2026-07-18). Supersedes `docs/04-roadmap.md`.
Operating loop: run the agent → every halt/error lands in
`docs/pivot/failure-log.md` → the log picks the next items here. Companion:
`CODE-REVIEW-2026-07.md`.

**Where we are (2026-07-18):** Week 2 milestone met — full payroll-cycle
tool set, approval gate, and run/resume wired into `/approvals`; the
`audit_logs` INSERT-policy gap from `week1-staging-readiness.md` shipped in
`20260704020000_agent_approvals` (verified on staging 2026-07-14). The
failure log is empty because the Week 3 dry run has not run yet — that dry
run (due **Jul 24**) is the current bottleneck and the only source of real
ranking signal for NEXT.

North star (Phase 1): **Beras Wortel's payroll runs itself; the owner only
approves.** The durable purpose behind it: Nexis is an **agentic operations
layer** — any recurring SME back-office workflow becomes agent-executed,
human-approved. Payroll is **workflow zero**, the template every later
workflow reuses: typed tools → structured halts → approval gate → failure
log. No second workflow starts until workflow zero has run live.

## The loop (re-run every orchestrator session)

1. **SENSE** — read `failure-log.md`, this roadmap, open PRs.
2. **PICK** — highest-ranked unblocked item; a fresh failure-log entry
   outranks any provisional ranking below.
3. **BRIEF** — orchestrator freezes the contract (names, types, lane
   boundaries) and delegates to lane owners; cross-lane work runs in
   parallel against the frozen contract.
4. **GATE** — orchestrator reviews every diff; `pnpm typecheck` + `pnpm
   test` green across the workspace, web builds, both locales, e2e intact.
5. **SHIP** — push the branch, open a draft PR **into `dev`** (owner rule
   2026-07-19: never straight to `main`; the owner promotes dev → main).
6. **LOG** — tick items here, append halts/misbehavior to the failure log,
   write an ADR for any architecture change. Go to 1.

The loop is re-enterable from a cold session: state lives entirely in this
file, the failure log, and git — never in a chat transcript.

## NOW — finish Phase 1 (dry run by Jul 24, live run by Jul 31)

| # | Item | Owner |
|---|---|---|
| 1 | ✔ Pre-dry-run fixes (error handling, rollback wording, /approvals polish, roles helper) — PR #69 | orchestrator |
| 2 | ✔ Delete `packages/leave` (dead) — PR #69 | orchestrator |
| 3 | `ANTHROPIC_API_KEY` into Vercel env (Pro plan for 300s actions). Sole hard blocker for the live run; the **dry run must not wait on it** — fall back to running `/approvals` from local dev against staging | **Boss** |
| 4 | ✔ Staging has `20260704020000_agent_approvals` applied (verified via Supabase migration list, 2026-07-14) | db-engineer |
| 5 | ✔ **Dry-run pre-flight** done 2026-07-19 → `dry-run-preflight-2026-07.md`. Rates/profiles/policy all green, **but roster is now 7 employees** — a hire with compensation effective **2026-07-17** would have been paid a silent full month (engine had no proration and no halt). Fixed same day: new `mid_period_compensation` halt. Dry run should expect 6/7 clean + 1 designed halt for E-7 | orchestrator |
| 6 | **Week 3 dry run (by Jul 24)**: `/approvals` → Jalankan agen → approve → resume → draft created; log every discrepancy vs manual calc + every halt into the failure log; check `audit.recorded` gaps | Boss + orchestrator |
| 7 | **Week 4 live run (by Jul 31)**: July payroll executed via agent with owner approval; review failure log; scope Phase 2 from it | Boss + orchestrator |

## NEXT — Phase 2 candidates (order by failure log; provisional ranking)

Re-ranked 2026-07-18 on the evidence available before the dry run: Beras
Wortel's roster has **zero** percentage earnings / earning groups
(`week1-staging-readiness.md`), so widening gross serves future rosters,
not customer zero — demoted. Hardening the run/resume path the dry run
will exercise is promoted; it is pure tests + dedupe (no behavior change)
and is the **only** NEXT item eligible to start before the dry run. Every
other item waits for the dry run's failure-log entries to re-rank this
list — do not burn the week the log was meant to steer.

1. ✔ **One statutory source** — `effectiveOn`/`sumFixedAllowances`/PTKP-JKK
   sets/period helpers moved into `@nexis/payroll`; preview and agent engines
   now import the same module. (domain-engineer)
2. ✔ **Tool-loader dedupe + `transitionRun` helper + TER B/C tool fixtures +
   resume driver test** — one `loadStatutoryInputs` shared by both compute
   tools, lifecycle tools share `transitionRun`, nonzero-band B/C tests with
   seed-derived numbers, plus (from the pre-flight) the new
   `mid_period_compensation` halt. (domain-engineer, 2026-07-19)
3. ✔ **Approval-token resolution fix** — driver now resolves approvals by
   `(tool_name, payload_hash)` discovery against `approval_requests`
   (oldest approved row wins; pending rows are reused, never duplicated);
   the tool-name-keyed `approvalTokens` param is deprecated to a fallback
   hint. ADR 0002 amended. (domain-engineer, 2026-07-19)
4. **`agent_cycles` table + approval expiry sweep + shared
   `PayrollConfigSnapshot` type**; tighten worker to `queued|processing`.
   (db-engineer)
5. **Widen the agent's gross** — percentage earnings + earning groups, then
   daily/mixed pay and approved overtime, so fewer rosters halt. Each halts
   until built — never estimates. Not needed by customer zero's current
   roster; rises the day a roster (or the failure log) demands it. A
   sub-item joins it from the pre-flight: **mid-period proration**, so
   `mid_period_compensation` halts can eventually resolve instead of
   requiring a backdated compensation row. (domain-engineer)
6. ✔ **`requireAdmin` sweep** — duplicated owner/admin checks replaced with
   `lib/roles.ts` across apps/web. (app-engineer)
7. **Approval queue niceties** — formatted payload (money as Rp, not JSON),
   cycle history view fed by `agent_cycles` (after item 4). (app-engineer)
8. **WhatsApp/email approval digest** — the pivot's v0 alternative surface;
   decide→approve via link. Needs an ADR first. (orchestrator → ADR 0005)

## LATER — workflow N (each reuses the workflow-zero template)

A workflow ships when it has: typed tools with structured halts, the
approval gate, an ADR if it changes architecture, and a failure-log feed.

- December reconciliation as an agent tool (new halt semantics; engine ready).
- THR run via agent. BPJS submission-prep tool.
- Second customer → multi-company orchestration, per-company scheduling
  (cron'd cycles proposing drafts automatically).
- Un-freeze decisions: each frozen surface is revived only when a paying
  workflow demands it — otherwise it eventually gets deleted, not maintained.

## Frozen surfaces (bugfix-only; list = CODE-REVIEW-2026-07.md)

Web: everything under `app/(app)` except `payroll` + `approvals` (+ the
`_landing` site and employee portal). Schema/functions: recruitment,
performance, billing, SSO/SCIM, public API/webhooks. `infra/gcp`.
Feeding-payroll tables (claims, loans, overtime/attendance, currencies) are
**not** frozen.

Bugfix-only in action: PRs #72–#75 (2026-07 auth flow — token_hash callback
shape, reset-password error copy, id-ID success copy) were maintenance on a
frozen-adjacent surface, correctly scoped to fixes with no new features.

## Team (ADR 0001)

Orchestrator (Fable 5) plans, reviews, gates. Workers: `db-engineer`
(schema/RLS/worker), `domain-engineer` (engine + agent packages),
`app-engineer` (web/mobile + its e2e). Every architecture change lands as an
ADR before code; every agent misbehavior lands in the failure log.
