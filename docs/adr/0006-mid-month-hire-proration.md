# ADR 0006 — Mid-month-hire proration (working-day basis)

- **Status:** Proposed (2026-07-31) — implemented pending owner sign-off on
  the working-day-vs-calendar-day basis (see "Owner to confirm" below).
  `computeEmployeeStatutory` (`packages/agent-tools/src/tools/statutory.ts`)
  and the calendar helpers (`packages/payroll/src/work-schedule.ts`) are
  built and tested; this ADR documents the decision for review.
- **Context:** `docs/pivot/ROADMAP.md` NEXT-5 ("mid-period proration" sub-item),
  `docs/05-indonesian-compliance.md`, `docs/pivot/dry-run-preflight-2026-07.md`
  (the `mid_period_compensation` halt this resolves), ADR 0001 (agent
  architecture), the pivot's ground rule 1 ("payroll numbers are never
  estimated").
- **Deciders:** Owner (Boss) to confirm; drafted by Claude Code
  (domain-engineer, delegated by the orchestrator).

## Context

The dry-run pre-flight (2026-07-19) found staging's 7th active employee
(customer zero, "E-7") hired **2026-07-17**, mid-July. The engine had no
concept of a partial month, so paying it a full month's salary would have
been silently wrong — the fix at the time was a hard halt,
`mid_period_compensation`, whenever a monthly-paid employee's selected
compensation row starts after the period's first day. That halt is correct
but permanent for E-7 until proration exists: every July run for a genuine
new hire stops, requiring either a backdated compensation row (itself an
estimate — the employee wasn't paid a full month) or manual intervention.

This ADR builds the proration and defines exactly when it applies, so the
halt resolves for a **genuine new hire** while continuing to protect against
the case it was designed for: silently paying an estimated full month.

## The compliance method

**Proration factor = (expected working days from the hire date through the
period end) ÷ (expected working days in the whole period month)**, using the
employee's weekly schedule (`compensation.work_days` override, else
`company_settings.work_days`).

- **Both `base_salary` and `compensation.fixed_allowances` scale by this
  factor** → a prorated monthly gross. Per-employee configurable earnings
  (`custom_earning_types` / `employee_earning`) are **not** prorated — the
  frozen method only names base salary and fixed allowances; whether a
  configurable earning should also prorate for a mid-month hire is a
  separate, unmade decision (flagged below).
- **BPJS Kesehatan / Ketenagakerjaan contributions compute on the prorated
  base salary**, respecting the existing wage caps exactly as they do for a
  full-month employee — no separate mid-month BPJS rule.
- **PPh 21 (TER method) looks up the rate on the prorated monthly gross.**
  The TER method already applies one monthly rate to whatever that month's
  gross is (PMK 168/2023) — there is no annualization step to adjust for a
  partial month, so a smaller gross simply lands in a lower (or the 0%) band.
  This is the same rule the engine already applies to every full-month
  employee; a prorated gross needs no special-casing here.
- Integer rupiah throughout, rounded exactly once per amount
  (`amount × workedDays ÷ totalDays`, rounded — never round-then-multiply),
  matching the engine's existing rounding rule.

### Why this is a deterministic calculation, not a forbidden estimate

Ground rule 1 (`docs/pivot/PIVOT-PHASE-1.md`) bans estimating payroll
numbers — a missing input must halt, not default. The proration factor is
**not** an estimate: every input it uses (the hire date, the weekly
schedule, the calendar) is a known, non-ambiguous fact for the period being
computed. Given those three inputs the factor is a single deterministic
number — the same run, computed today or next year, produces the identical
factor and the identical rupiah amounts. This is categorically different
from, say, defaulting a missing PTKP status to TK/0: there is no guess here,
only arithmetic over data that is either present (proceed) or absent/
inconsistent (halt, per the trigger below).

## The strict trigger — new hire vs. comp change

A compensation row effective after the period start is **either** a genuine
new hire (prorate) **or** a mid-month compensation change / raise for an
employee who already existed at the period start (a "split-rate" month —
still halts). Confusing the two would silently underpay a raised employee
for days they worked at their old rate, or overpay/mis-tax a new hire — so
the trigger is deliberately conservative:

Prorate **only** when **all** of the following hold for the selected
compensation row:

1. `pay_frequency === "monthly"` (unchanged: daily/mixed still halt with
   `unsupported_pay_frequency`, proration doesn't apply to them).
2. The selected row's `effective_from > periodStart`.
3. **No other compensation row for this employee is in force at
   `periodStart`** (i.e., no row with `effective_from <= periodStart`) — if
   one exists, this is a comp change/raise, not a new hire, regardless of
   how brief the "old" row's coverage was.
4. **`employees.join_date`, when set, confirms the hire**: it must be
   *after* the period start (the hire genuinely falls within this period)
   and *on/before* the compensation row's `effective_from` (you cannot be
   paid from a date before you joined). A `join_date` that contradicts
   either bound means the data doesn't support "new hire this period" —
   halt instead of prorating. A missing `join_date` does not block
   proration (condition 3 already carries the main safety burden); the hire
   date used for the factor's numerator is `join_date` when present, else
   the compensation row's `effective_from`.

Any employee failing (3) or (4) keeps the original `mid_period_compensation`
halt, with a message naming which condition failed (comp change vs.
join-date mismatch) so the owner knows what to fix. Non-monthly pay
frequencies are unaffected — that halt (`unsupported_pay_frequency`) is
unchanged and checked first.

## Options considered

### A. Working-day basis (IMPLEMENTED)

Described above: the ratio is over *expected working days*, using the
employee's actual weekly schedule (which may be a 5- or 6-day week).
- **Pros:** matches how Indonesian payroll practice usually explains a
  partial month ("worked 11 of 23 hari kerja"); correctly gives a 6-day-week
  employee a different, larger fraction than a 5-day-week employee hired on
  the same date; consistent with the existing `work_days` model already used
  by daily/mixed pay frequencies and the interactive run preview
  (`apps/web/lib/payroll.ts`).
- **Cons:** requires resolving a schedule (own `work_days` override, else
  company default) as an extra input; a company/employee with a
  misconfigured or unusual schedule could produce a less intuitive fraction
  than a calendar-day count would.

### B. Calendar-day basis

Proration factor = (calendar days from hire date through period end) ÷
(calendar days in the month) — e.g. Rina hired 2026-07-17 gets
(31−17+1)/31 = 15/31, regardless of which of those days are workdays.
- **Pros:** simpler (no schedule dependency); some payroll systems and some
  Indonesian employment contracts use "days in the month" as the divisor.
- **Cons:** ignores that pay is compensation for expected *work*, not
  calendar presence — a hire the Friday before a long weekend gets credited
  weekend days they were never expected to work (and never scheduled to be
  paid for under the working-days model this codebase already uses for
  daily/mixed employees). Diverges from the schedule-aware model everywhere
  else in the engine.

## Decision

**Option A — working-day basis**, using `compensation.work_days` (else
`company_settings.work_days`) and the existing `expectedWorkdaysInMonth`
calendar model already used for daily/mixed pay frequencies. **This choice
(A vs. B) is the owner's call to confirm at review** — both are defensible,
and Indonesian practice does not universally settle on one. If the owner
prefers calendar-day basis, the change is isolated to
`packages/payroll/src/work-schedule.ts`'s `hireProrationFactor` /
`expectedWorkdaysFrom`; the trigger logic in
`packages/agent-tools/src/tools/statutory.ts` is unaffected either way.

## One statutory source (NEXT-1) — where the calendar math lives

The workday-calendar pieces (`WEEKDAYS`, `DEFAULT_WORK_DAYS`,
`normalizeWorkDays`, `isoWeekday`, `isExpectedWorkday`,
`expectedWorkdaysInMonth`) already existed in `apps/web/lib/work-schedule.ts`
for the settings UI, the employee form, and the interactive run preview.
Agent tools are outside `apps/web`'s lane and cannot import it (nor edit it —
`apps/web` is app-engineer's lane), so this ADR **replicates** those pure
functions into `packages/payroll/src/work-schedule.ts` and adds the new
proration pieces (`expectedWorkdaysFrom`, `hireProrationFactor`,
`prorateByFactor`) alongside them. `apps/web/lib/work-schedule.ts` is
**unchanged** and still has its own copy of the shared subset — this is a
known duplication, not a fix, and is the direct continuation of NEXT-1 ("one
statutory source"): a follow-up (app-engineer, when that seam is next
touched) should repoint `apps/web/lib/work-schedule.ts` at
`@nexis/payroll`'s copy instead of maintaining a parallel one.

## Explicit follow-ups (not decided by this ADR)

1. **Split-rate months.** A mid-month compensation *change* (a raise, a
   status change) for an already-employed person still halts
   (`mid_period_compensation`) with no proration path. Building that would
   mean prorating and summing two (or more) sub-periods at different rates
   within one month — a materially different computation (and a different
   halt-boundary question: does BPJS/PPh21 also split, or use the rate in
   force at period end?). Left for its own ADR when the failure log or a
   real roster demands it.
2. **Preview-engine alignment.** `apps/web/lib/payroll.ts` (the interactive
   run preview) does not implement this proration or halt — it silently
   falls back to the earliest available compensation row for a mid-period
   hire (see its comment: "Latest-effective compensation per employee...,
   with fallback to earliest if none is effective yet"). That preview is a
   different, non-agent surface (app-engineer's lane) with looser
   guarantees (it substitutes defaults with warnings rather than halting);
   whether it should adopt the same working-day proration is a follow-up
   for whoever next touches it, tracked here so the two surfaces don't
   silently diverge on numbers for the same employee.
3. **Configurable per-employee earnings.** Whether a fixed-amount
   configurable earning (`custom_earning_types`) should also prorate for a
   new hire (today: not prorated, added on top of the prorated base+
   allowances) is unresolved — flagged in the code
   (`packages/agent-tools/src/tools/statutory.ts`) and here for the owner.

## Consequences

- `computeEmployeeStatutory` (`packages/agent-tools/src/tools/statutory.ts`)
  gains: `StatutoryInput.employee.join_date`, `StatutoryInput.companyWorkDaysRaw`,
  `CompRow.work_days`, and an optional `StatutoryLine.proration` field
  (`{ hireDate, workedDays, totalDays }`) so the approval queue can show the
  fraction that produced a new hire's numbers.
- `loadStatutoryInputs` (`packages/agent-tools/src/tools/load-inputs.ts`)
  selects three additional existing columns: `employees.join_date`,
  `compensation.work_days`, `company_settings.work_days`. No migration
  needed — all three columns already exist in `packages/types`.
- `compute_payroll_run` and `compute_pph21_for_employee` pass the new fields
  through; a genuine new hire now resolves to a normal computed line instead
  of a halt. A mid-month comp change still halts exactly as before, with a
  message clarifying it's a comp change (not a join-date mismatch).
- The engine's non-negotiables are unchanged: money is integer rupiah, rates
  are still data (unaffected — proration only scales the wage base fed into
  the existing rate lookups), and any input the trigger can't confirm still
  halts rather than guessing.
