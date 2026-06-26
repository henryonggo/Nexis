# Worked example — Stage 5: Leave & Reimbursement Claims

A concrete run of the six-agent team against a real Nexis stage. Spec:
`docs/stages/stage-05-leave-claims.md`. This mirrors the actual cross-agent handoff
recorded in that doc, re-expressed as a single-owner (all-Claude) team.

The orchestrator (`claude --model opus`) drives this; agents are delegated to in the
phase order below.

---

## Phase 1 — Plan (`architect`, Opus)

**Orchestrator delegates:** "Plan Stage 5 leave + reimbursement claims per
`docs/stages/stage-05-leave-claims.md`. Produce contracts, the DB requirements for
`db-engineer`, the parallel/dependency map, and compliance notes."

**Architect returns:**

*Task breakdown (owner → parallelizable?):*

| Work item | Owner | Parallel group |
|---|---|---|
| Leave-balance engine (entitlement, accrual, proration, carry-over, countLeaveDays) | `domain-engineer` | A (no DB dep) |
| `leave_types`, `leave_balances`, `leave_requests`, `claim_types`, `reimbursement_claims` + RLS | `db-engineer` | B (schema leads) |
| `approve_leave` / `reject_leave` / `approve_claim` SECURITY DEFINER RPCs (atomic balance change, audit-logged) | `db-engineer` | B |
| Private Storage buckets `leave-attachments`, `claim-receipts` + policies | `db-engineer` | B |
| Realtime publication for `leave_requests`, `reimbursement_claims` | `db-engineer` | B |
| Payroll integration: worker reads approved claims, adds (non-)taxable line, marks `paid` | `db-engineer` + `domain-engineer` | C (after B) |
| Mobile: request flow (type, dates, reason, attachment), claim submit + receipt | `mobile-engineer` | D |
| Web: approval dashboard (Realtime), team calendar, balance views | `web-engineer` | D |
| i18n strings (id-ID + en) | `web-engineer` / `mobile-engineer` | D |
| e2e: submit→approve→decrement; reject→restore; reimb→payroll; RLS guards | `qa` | E (last) |

*Key contracts (the shapes everyone codes against):*
- `@nexis/leave` engine methods are policy-input-driven (numbers passed in, not
  hardcoded): `annualEntitlement`, `accruedAsOf`, `carryOver`, `countLeaveDays`
  (excludes weekends + public holidays, half-day aware), `availableBalance`,
  `validateLeaveRequest`.
- Enums: `leave_status = pending|approved|rejected|cancelled`;
  `claim_status = pending|approved|rejected|paid`.
- Days are `numeric(4,1)` (half-day). Money is `bigint` (integer rupiah).

*DB requirements for `db-engineer`* (verbatim handoff):
- Five tenant-scoped tables above, RLS ON. Employees self-insert/self-read their own
  `leave_requests` / `reimbursement_claims`; **employees may NOT write
  `leave_balances`** — only the approval RPC adjusts it.
- Approval RPCs are SECURITY DEFINER, assert same-company manager/admin, do the
  balance decrement-on-approve / restore-on-reject atomically, and audit-log (AC #6).
- Storage buckets + policies (employee self-read own; manager/admin same-company).
- Realtime publication additions.
- `pnpm db:types` as the final step.

*Compliance notes:* proration by join month; carry-over capped per
`max_carry_over_days`; reimbursement taxable flag drives the payroll line type;
nothing here hardcodes a rate.

**Orchestrator shows this to the human and waits for approval.**

---

## Phase 2 — Schema first (`db-engineer`, Sonnet)

**Delegated brief:** the DB-requirements block above.

**db-engineer does:**
- New migration `supabase/migrations/<UTCstamp>_stage5_leave_claims.sql` — the five
  tables, enums, RLS policies (self-scope for employees, same-company manager/admin
  for approvers), and the three SECURITY DEFINER RPCs with audit logging.
- Storage buckets + policies; Realtime publication ALTER.
- pgTAP in `supabase/tests/stage5_leave_claims.test.sql`: employee can't write
  `leave_balances`; employee can't approve own request; cross-company isolation.
- Runs `pnpm db:types` → commits regenerated `packages/types/src/database.ts`.
- Leaves `// TODO(app): wire approval dashboard to approve_leave/reject_leave` notes.

**Definition of done:** `supabase db reset` clean, RLS ON, pgTAP green, types match.

> App agents may begin Phase 3 in parallel the moment the *shapes* are agreed (end of
> Phase 1) — they code against them with `TODO(db)` markers and only block on the
> real type regen landing here.

---

## Phase 3 — Implement in parallel

**`domain-engineer` (Sonnet)** — `packages/leave`:
- Pure leave-balance engine + fixtures (the doc notes ~20 tests). Deterministic,
  no DB. Both the web app and the payroll worker consume this — the math is not
  re-implemented elsewhere.
- DoD: `pnpm --filter @nexis/leave typecheck` + `test` pass.

**`web-engineer` (Haiku)** — `apps/web`:
- Approval dashboard subscribing to Realtime `leave_requests`; team calendar; balance
  views; admin correction UI calling the approval RPCs.
- Consumes `@nexis/leave` for any display math; never re-derives balances.
- i18n: new strings in `messages/id.json` + `messages/en.json`.
- Any not-yet-generated shape → `// TODO(db): ... — db-engineer`, replaced once
  Phase 2 types land.
- DoD: `pnpm --filter @nexis/web typecheck` + `build` pass.

**`mobile-engineer` (Haiku)** — `apps/mobile`:
- Request flow (pick type, dates, reason, optional attachment → `pending`); claim
  submit with receipt upload to the private bucket.
- i18n both locales; money rendered as integer rupiah.
- DoD: mobile `tsc --noEmit` passes.

These three rarely touch the same files, so the orchestrator runs them concurrently.

---

## Phase 4 — Wire real types

Once `db-engineer`'s regenerated `packages/types` is committed, the orchestrator has
`web-engineer` and `mobile-engineer` replace every `TODO(db)` with the real generated
type and delete the markers.

---

## Phase 5 — Validate (`qa`, Sonnet)

- Playwright `apps/web/e2e/leave-claims.spec.ts`: employee submits → manager approves
  → balance decrements (incl. proration); reject restores balance + notifies;
  reimbursement with receipt → approved → appears in next payroll run (AC #1–4).
- App-consumption RLS guards: employee can't act on another company; employee can't
  hit the approve path (AC #5). (DB-level isolation itself is `db-engineer`'s pgTAP.)
- Money assertions against `@nexis/leave` / `@nexis/payroll` fixtures — no float drift.
- Bugs reported back to the owning agent (e.g. a proration miss → `domain-engineer`;
  a dashboard wiring bug → `web-engineer`), then re-run.

---

## Phase 6 — Integrate

Orchestrator confirms: RLS ON for all five tables; balance mutations only via the
SECURITY DEFINER RPCs (employees can't write balances); web + mobile agree on the
enum/field contract; money integer rupiah throughout; strings in both locales;
`packages/types` matches schema; no unresolved `TODO(db)`. Emits a one-paragraph
status and the branch (`claude/stage5-leave-claims`).

---

### What this example demonstrates

- The seam survives single ownership as **schema-leads-app sequencing**, not a wall.
- Real parallelism comes from the workspace package split (`leave` engine, web,
  mobile) plus the early-shape-agreement that lets app agents work while
  `db-engineer` lands the migration.
- The security-critical pieces (RLS, employee-not-writable balances, SECURITY
  DEFINER approval RPCs) are concentrated in the Sonnet `db-engineer`, not the
  cheaper UI agents — which is exactly where the model spend should go.
