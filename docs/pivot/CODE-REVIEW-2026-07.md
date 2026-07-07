# Code review — full-repo, post-Phase-1-build (2026-07-06)

Orchestrated review: three parallel lane reviews (domain, app, db) synthesized
by the orchestrator. Verdict up front: **the workflow-zero path is sound and
well-tested; the repo's real problem is pre-pivot surface area** — ~13K lines
of web UI and a dozen schema domains that no longer serve the strategy and
now only cost maintenance. Freeze hard, delete the provably dead, and fix six
small things before the Week 3 dry run.

## Remove (dead — delete now)

| What | Evidence | Action |
|---|---|---|
| `packages/leave` (~360 lines incl. tests) | Zero imports repo-wide; web and mobile each carry their own leave math and never call it | **Deleted in this PR**; restore from git if Stage 5 returns |

## Freeze (working, out of scope — bugfixes only, no investment)

- **Web routes** (lines): employees 2091 · attendance 1471 · dashboard 1007 ·
  members 848 · leave 767 · claims 726 · performance 668 · settings 647 ·
  billing 593 · deductions 566 · earnings 562 · developer 539 · loans 410 ·
  analytics 383 · profile 353 · reports 325 · payslips 249 · glance 235 ·
  superadmin 199 · access 188 · audit 184 · companies 174 — plus `_landing`
  (~483) and the employee portal. Workflow zero is `payroll` (1668) +
  `approvals` (419); everything else is frozen.
- **Schema/functions**: recruitment (candidates/applications/interviews/
  job_openings), performance, billing (+ billing webhooks/checkout), SSO/SCIM,
  public API + webhook queue. All have proper admin-scoped RLS — safe to
  freeze as-is, no permissive-policy risk found.
- **NOT freezable** (they feed net pay / the worker): reimbursement_claims,
  claim_types, loan_installments, overtime/attendance/geofences/shifts/
  work_schedules, currencies/exchange_rates.
- `infra/gcp` Terraform: freeze-safe.

## Fix before the Week 3 dry run (small, done in this PR where marked ✔)

1. ✔ **No try/catch around `runPayrollCycle`** — an Anthropic 5xx crashed to
   Next's generic error page instead of the panel's id-ID error state.
2. ✔ **`approve_payroll_run` rollback message could lie** — if the worker
   advanced the run past `queued` before the rollback query, the update
   no-ops but the halt still claimed "rolled back to draft."
3. ✔ **`/approvals` UI polish** — hand-rolled status colors → shared `Badge`
   variants; raw `<input>` → `Input`; bare empty card → `EmptyState`;
   route-level `loading.tsx`; dashboard revalidation after a cycle.
4. ✔ **`lib/roles.ts`** — canonical `isAdminRole`/`isManagerRole` helper;
   adopted in the agent-cycle path (the repo-wide ~50-call-site sweep is a
   roadmap item, not a pre-dry-run change).
5. **Owner checklist (not code):** `ANTHROPIC_API_KEY` in Vercel (Pro plan —
   `maxDuration 300` is capped to 60s on Hobby); confirm the staging project
   received the idempotency-fixed migration (the fix landed after the last
   staging apply); confirm the roster is still 100% monthly-paid with
   fixed-amount earnings only — anything else halts the whole run (that halt
   is correct behavior, but know it's coming).

## Improve (deliberate refactors — roadmap, not this PR)

- **One statutory source.** `effectiveOn` / `sumFixedAllowances` /
  PTKP-JKK sets are byte-copied between `apps/web/lib/payroll.ts` and
  `agent-tools/statutory.ts`; the two engines share no cross-check test.
  Move the primitives into `@nexis/payroll` and add a "same input → same
  numbers" parity test.
- **Dedupe the tool loaders** — `compute-pph21` re-issues the whole-roster
  10-table load for one employee (~70 duplicate lines); one parameterized
  loader.
- **`transitionRun` helper** for the three lifecycle tools' identical
  update-and-verify pattern.
- **`agent_cycles` table** (db) — durable parent record per orchestrator run;
  today the dry-run log must be reconstructed from `audit_logs`.
- **Approval expiry sweep** (db) — nothing flips lapsed rows to `expired`;
  `consume_approval` is safe regardless, but an admin can approve an
  already-expired request into a permanently dead `approved` row.
- **Shared `PayrollConfigSnapshot` type** — worker reads the snapshot as
  `any`; drift between writer (agent-tools) and reader (worker) is otherwise
  inevitable. Also tighten the worker to `queued|processing` once the agent
  path is the only trigger (today it accepts `draft` for the legacy button).
- **Tool-layer TER fixtures** — category B/C fixtures only cover the 0% band;
  add one nonzero-band B/C employee through the tool layer.
- **Resume ergonomics** — `approvalTokens` is keyed by tool name; two
  same-named proposals in one turn would fight over one slot. Add the driver
  test, and log both hashes on `consume_approval` mismatch during the dry run.
- **Audit visibility** — `audit.recorded === false` is silently swallowed;
  surface it in the panel during the dry run.

## What's genuinely good (keep doing this)

Integer rupiah held everywhere; halt-don't-guess enforced at every layer and
tested; the RLS OR-combination hardening in the approvals migration is
textbook; no unused exports in the new packages; pgTAP + vitest coverage on
the money path is strong; the owner's idempotency fix to the migration was
correct and complete.
