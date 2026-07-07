# Nexis Roadmap

**Status: ACTIVE** (2026-07-06). Supersedes `docs/04-roadmap.md`. Operating
loop: run the agent → every halt/error lands in `docs/pivot/failure-log.md` →
the log picks the next items here. Companion: `CODE-REVIEW-2026-07.md`.

North star: **Beras Wortel's payroll runs itself; the owner only approves.**

## NOW — finish Phase 1 (this week)

| # | Item | Owner |
|---|---|---|
| 1 | ✔ Pre-dry-run fixes (error handling, rollback wording, /approvals polish, roles helper) — this PR | orchestrator |
| 2 | ✔ Delete `packages/leave` (dead) — this PR | orchestrator |
| 3 | `ANTHROPIC_API_KEY` into Vercel env (Pro plan for 300s actions) | **Boss** |
| 4 | Confirm staging has the idempotency-fixed approvals migration applied | db-engineer |
| 5 | **Week 3 dry run**: `/approvals` → Jalankan agen → approve → resume → draft created; log every discrepancy vs manual calc + every halt into the failure log; check `audit.recorded` gaps | Boss + orchestrator |
| 6 | **Week 4 live run**: July payroll executed via agent with owner approval; review failure log; scope Phase 2 from it | Boss + orchestrator |

## NEXT — Phase 2 candidates (order by failure log; provisional ranking)

1. **One statutory source** — move `effectiveOn`/`sumFixedAllowances`/PTKP-JKK
   sets into `@nexis/payroll`; parity test between preview and agent engines.
   (domain-engineer)
2. **Widen the agent's gross** — percentage earnings + earning groups, then
   daily/mixed pay and approved overtime, so fewer rosters halt. Each halts
   until built — never estimates. (domain-engineer)
3. **`agent_cycles` table + approval expiry sweep + shared
   `PayrollConfigSnapshot` type**; tighten worker to `queued|processing`.
   (db-engineer)
4. **Tool-loader dedupe + `transitionRun` helper + TER B/C tool fixtures +
   resume driver test** (same-named double proposal). (domain-engineer)
5. **`requireAdmin` sweep** — replace ~50 duplicated role checks with
   `lib/roles.ts`. Mechanical; pairs well with any frozen-page bugfix.
   (app-engineer)
6. **Approval queue niceties** — formatted payload (money as Rp, not JSON),
   cycle history view fed by `agent_cycles`. (app-engineer)
7. **WhatsApp/email approval digest** — the pivot's v0 alternative surface;
   decide→approve via link. Needs an ADR first. (orchestrator → ADR 0005)

## LATER

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
