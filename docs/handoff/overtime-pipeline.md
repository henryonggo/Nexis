# Handoff — Overtime Pipeline (Case-02 G5)

> **Status:** DB writer implemented by Antigravity (migration + pgTAP tests passed); app follow-ups
> (approval UI, estimator wiring) return to Claude after the migration.
> This doc is the `TODO(db)` tracking item per `docs/08-agent-boundaries.md`.
> Full audit trail: `docs/cases/case-02-attendance-to-first-payroll.md` (steps 29, 30, 36).

## Problem (one paragraph)

Overtime is computed nowhere. Both ends exist: `calculate_overtime_hours(p_employee_id,
p_date)` (stage-3) correctly derives actual vs scheduled minutes, break deduction, and
rest-day/holiday classification; the payroll worker consumes **approved**
`overtime_entries` for the run period. But no trigger, job, or UI ever inserts a row
into `overtime_entries`, and the web estimator hardcodes `overtimePay: 0`
(`TODO(stage4)` in `apps/web/lib/payroll.ts:269`). Result: overtime never reaches
payroll — a compliance gap, since UU Cipta Kerja overtime pay is mandatory.

## Existing pieces (do not rebuild)

- `overtime_entries` (stage-3): `company_id, employee_id, date, duration_minutes,
  multiplier numeric(3,1), is_approved default false, approved_by → employees(id)`.
- `calculate_overtime_hours()` → `(actual_work_minutes, scheduled_minutes,
  overtime_minutes, is_rest_day)`.
- RLS: `overtime: select` (staff + self), `overtime: admin modify` (admin/manager write).
- Worker reads `is_approved = true` entries for the run window
  (`services/payroll-worker/src/index.ts:308`).
- Engine multipliers (weekday ×1.5/×2.0; rest-day ×2.0/×3.0/×4.0 per docs/05 §4) live
  in `packages/payroll` — the **engine** applies statutory multipliers from *hours*;
  see "multiplier semantics" below before duplicating them in SQL.

## TODO(db) — required for Antigravity

### 1. Decide and document multiplier semantics (do this first)

`overtime_entries.multiplier` overlaps with the engine's statutory multipliers. Pick
one owner to avoid double-counting:

- **Option A (recommended):** entries store *raw classified minutes only* —
  `multiplier` reflects classification (1.0 = weekday OT, 2.0 = rest-day/holiday OT)
  used purely as a *category tag*; the worker/engine derives pay from hours +
  category via `packages/payroll` (hour-by-hour brackets). Document that `multiplier`
  is category, not a pay factor.
- **Option B:** entries are pre-multiplied; engine must then NOT re-apply brackets.
  Requires a worker change — riskier.

**Decision:** Option A chosen. `overtime_entries.multiplier` stores `1.0` (weekday) or `2.0` (rest-day/holiday) as a classification category tag. The packages/payroll engine handles statutory multipliers based on duration and this category. State choice in the migration.

### 2. Writer: `generate_overtime_entries(p_company_id uuid, p_date date)`

Set-based function that, for each active employee of the company with a clock-out on
`p_date`, calls `calculate_overtime_hours` and **upserts** one row per
(employee, date) when `overtime_minutes > 0`:

- idempotent: re-running for the same date updates `duration_minutes`/classification
  of *unapproved* rows; never touches `is_approved = true` rows (approved hours are a
  manager decision — flag a discrepancy instead, e.g. `updated_at` + note column if
  you prefer).
- unique index `(employee_id, date)` to make the upsert safe.
- classification from `is_rest_day` (and holiday membership) per §1's chosen scheme.

### 3. Invocation: trigger vs scheduled job

Recommended: **statement-level trigger on `attendance_records` after insert/update of
a `clock_out`** calling the writer for that employee/date (cheap, immediate, works on
corrections too). Alternative: pg_cron nightly sweep per company. If corrections
(C9 step 28) change a record retroactively, the trigger path recomputes automatically —
make sure the update path is covered, not just insert.

### 4. pgTAP tests (`supabase/tests/overtime_pipeline.test.sql`)

- Weekday: clock 09:00–20:00 vs 8h schedule → expected `overtime_minutes` (break-aware).
- Rest day/holiday: full classification (uses seeded holiday row).
- Idempotency: writer twice for same date → one row, no drift.
- Approved row protected: writer re-run does not modify an approved entry.
- Correction flow: admin invalidates the clock-out → entry recomputed/zeroed.
- RLS: employee sees own entries only; manager can approve (`is_approved`,
  `approved_by`); employee cannot.

### 5. Regenerate `packages/types` if anything new is exposed (new RPC, columns).

## Follow-ups that return to Claude after the migration

1. **Approval queue UI** on `/attendance` (or a tab): pending entries with employee,
   date, minutes, classification; Setujui/Tolak for owner/admin/manager; audited.
2. **Estimator wiring:** remove `overtimePay: 0` TODO in `apps/web/lib/payroll.ts` —
   sum approved entries for the period into `EmployeePayrollInput` so the draft
   preview matches the worker's final numbers.
3. **e2e:** extend `attendance.spec.ts` or new spec — approve a pending entry, assert
   it lands in the next draft run's preview.
4. i18n keys (id + en) for the approval surface.

## Acceptance (definition of done for this handoff)

1. Sari clocks 09:00–20:00 against an 8h schedule → pending entry with correct
   minutes appears without any manual step.
2. Manager approves it → next payroll draft and worker output include the overtime
   pay, matching `packages/payroll` fixtures for the same hours.
3. Unapproved entries never affect payroll; approved entries survive writer re-runs.
4. All pgTAP tests in §4 green; existing stage-3/4 tests still green.
5. Case-02 steps 29/30/36 flip to ✅; re-test checklist items 3 & 5 pass.
