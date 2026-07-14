# Nexis Roadmap

**Status: ACTIVE** (2026-07-06). Supersedes `docs/04-roadmap.md`. Operating
loop: run the agent → every halt/error lands in `docs/pivot/failure-log.md` →
the log picks the next items here. Companion: `CODE-REVIEW-2026-07.md`.

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
5. **SHIP** — push the branch, open a draft PR; the owner merges.
6. **LOG** — tick items here, append halts/misbehavior to the failure log,
   write an ADR for any architecture change. Go to 1.

The loop is re-enterable from a cold session: state lives entirely in this
file, the failure log, and git — never in a chat transcript.

## NOW — finish Phase 1 (this week)

| # | Item | Owner |
|---|---|---|
| 1 | ✔ Pre-dry-run fixes (error handling, rollback wording, /approvals polish, roles helper) — PR #69 | orchestrator |
| 2 | ✔ Delete `packages/leave` (dead) — PR #69 | orchestrator |
| 3 | `ANTHROPIC_API_KEY` into Vercel env (Pro plan for 300s actions) | **Boss** |
| 4 | ✔ Staging has `20260704020000_agent_approvals` applied (verified via Supabase migration list, 2026-07-14) | db-engineer |
| 5 | **Week 3 dry run**: `/approvals` → Jalankan agen → approve → resume → draft created; log every discrepancy vs manual calc + every halt into the failure log; check `audit.recorded` gaps | Boss + orchestrator |
| 6 | **Week 4 live run**: July payroll executed via agent with owner approval; review failure log; scope Phase 2 from it | Boss + orchestrator |

## NEXT — Phase 2 candidates (order by failure log; provisional ranking)

1. ✔ **One statutory source** — `effectiveOn`/`sumFixedAllowances`/PTKP-JKK
   sets/period helpers moved into `@nexis/payroll`; preview and agent engines
   now import the same module. (domain-engineer)
2. **Widen the agent's gross** — percentage earnings + earning groups, then
   daily/mixed pay and approved overtime, so fewer rosters halt. Each halts
   until built — never estimates. (domain-engineer)
3. **`agent_cycles` table + approval expiry sweep + shared
   `PayrollConfigSnapshot` type**; tighten worker to `queued|processing`.
   (db-engineer)
4. **Tool-loader dedupe + `transitionRun` helper + TER B/C tool fixtures +
   resume driver test** (same-named double proposal). (domain-engineer)
5. ✔ **`requireAdmin` sweep** — duplicated owner/admin checks replaced with
   `lib/roles.ts` across apps/web. (app-engineer)
6. **Approval queue niceties** — formatted payload (money as Rp, not JSON),
   cycle history view fed by `agent_cycles`. (app-engineer)
7. **WhatsApp/email approval digest** — the pivot's v0 alternative surface;
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

## Team (ADR 0001)

Orchestrator (Fable 5) plans, reviews, gates. Workers: `db-engineer`
(schema/RLS/worker), `domain-engineer` (engine + agent packages),
`app-engineer` (web/mobile + its e2e). Every architecture change lands as an
ADR before code; every agent misbehavior lands in the failure log.
