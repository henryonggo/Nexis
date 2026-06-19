# Plan — Self-service + Payments (branch `fix/self-service-payments`)

Five changes requested. Scope split: **Claude Code** (app layer) vs **Antigravity**
(DB / RLS / RPC / worker).

## Status (branch `fix/self-service-payments`)

- **#1 Dashboard full salary breakdown — DONE** (`cf2f6dc`).
- **#2 Web submission (leave/claim/attendance) — DONE** (`34ccc09`). Hierarchy
  approval (H-2) — **DONE (DB Migration applied)**.
- **#3 Cash payments — DONE** (`d95f345`, DB `81f35ea`). Admin cash-payment panel
  on the run page (select/deselect, confirm via `mark_payroll_items_paid`) +
  cash/bank `payment_method` selector (cash default) on the employee form.
- **#4 Daily/monthly mix — BLOCKED on Antigravity H-4** + a compliance decision.
  Deferred deliberately: the monthly engine is TER-based; daily workers (*pekerja
  harian*) use a different PPh 21 path (daily Rp450k / monthly Rp4.5M threshold,
  PMK 168/2023). Building the engine before the days-worked source column and the
  tax-rule decision are pinned would be speculative and risk a compliance error.
- **#5 Web payslip download (multi-month) — DONE** (`2a793e4`). Storage policy (H-5) robustness has also landed.



Current-state facts that shaped the plan:

- Leave/claim/attendance **submission already exists on mobile**
  (`submitLeaveRequest`, `submitClaim`, `recordAttendance`). Web has **no employee
  submission UI** — the leave/claims pages are approver queues only.
- Approval guard is flat `owner|admin|manager` (any manager can approve anyone).
  Hierarchy column `employees.manager_id` already exists but is **not used** to
  scope approvals. Approval runs through SECURITY DEFINER RPCs (`approve_leave`,
  `reject_leave`, claim + overtime equivalents) — Antigravity's lane.
- No `payment_method` / paid-tracking columns exist anywhere.
- `compensation.pay_frequency` column exists but is **unused**; the engine is
  `computeMonthlyPayroll` only. `employment_type` enum already includes `"daily"`.
- Payslip download route exists but **explicitly 403s employees**
  (`apps/web/app/(app)/payroll/[runId]/payslip/[payslipId]/route.ts`).
- `payroll_items` already carries `base_salary, allowances, overtime_pay,
  gross_pay, pph21, bpjs_*, jht_*, jp_*, loan_deduction, net_pay, breakdown(Json)`
  — full breakdown data is present; only the UI is partial.

---

## 1. Dashboard: always show full salary breakdown — **Claude only**

Today `PayBreakdownCard` renders only when a payslip exists AND shows deductions
only (tax/BPJS/loan).

- [ ] Show breakdown unconditionally for employees with `access.salary`
      (drop the `latestPay &&` gate).
- [ ] Expand to **full** breakdown: earnings (base, fixed allowances, overtime) →
      gross → deductions → net.
- [ ] Fallback when no payslip yet: render from current `compensation`
      (`base_salary` + `fixed_allowances`) so it's never blank.
- [ ] i18n strings (id + en); Playwright happy-path.

No DB needed.

---

## 2. Web submission for leave / claim / attendance + hierarchy approval

**Claude (app):**
- [ ] Add employee submission UI on web — mirror the mobile flows:
      leave request form (`/leave`), claim submit + receipt upload (`/claims`),
      attendance clock-in/out (`/attendance`) for the `employee` role.
- [ ] Reuse existing insert/RPC paths the mobile app already calls (no new write
      paths invented on the app side).

**Antigravity (DB/RLS/RPC) — see handoff H-2:** the hierarchy rule
(owner > admin > manager > employee; an employee is approved only by their
appointed `manager_id` or higher; if `manager_id` is null, any manager+; owner can
approve own requests) must be enforced in the approval RPCs + RLS, not just the UI.
- [ ] After Antigravity lands it, update `canApprove`-style UI gating to match
      (show the approve action only when the viewer is in the approval chain).

---

## 3. Cash as default payment + admin "mark all paid" + per-employee select

**Antigravity (DB) — see handoff H-3.** New columns + a paid-tracking surface.

**Claude (app), after columns land:**
- [ ] Payroll run page: per-employee paid checkboxes (select/deselect), default all
      selected.
- [ ] "Confirm cash paid" button → marks selected rows paid (calls the
      Antigravity-provided RPC/update).
- [ ] Default new compensation `payment_method = cash`; allow `bank`.
- [ ] i18n + Playwright (mark-paid happy path + the guard).

---

## 4. Mixed daily + monthly pay schedules

**Claude (`packages/payroll`, app):**
- [ ] Add `computeDailyPayroll` (or extend the engine) keyed off
      `compensation.pay_frequency` (`monthly` | `daily`), with unit tests.
- [ ] Run form (`/payroll/new`): allow a run to include both daily and monthly
      employees; daily uses days-worked (from attendance) × daily rate.

**Antigravity — see handoff H-4:** worker (`services/payroll-worker`) must call the
daily path; confirm/extend `pay_frequency` values + any `daily_rate` /
`days_worked` source columns.

---

## 5. Download payslip on web (employee, multi-month) — mostly **Claude**

- [ ] Employee payslips page on web (list own payslips by period).
- [ ] Multi-select months → download (zip of PDFs, or sequential signed-URL
      downloads).
- [ ] Relax the route guard so an employee can fetch **their own** payslip PDF
      (today it 403s all employees).
- [ ] **Check first:** storage RLS on the `payslips` bucket — if it blocks employee
      reads of their own PDF, that's Antigravity (handoff H-5). Verify before coding
      the download.

---

## Antigravity handoff (DB / RLS / RPC / worker)

- **H-2 (hierarchy approval):** enforce the manager-chain rule in `approve_leave`,
  `reject_leave`, and the claim + overtime approval RPCs + RLS. Uses existing
  `employees.manager_id`. Owner can self-approve.
- **H-3 (cash payments):**
  - `compensation.payment_method text not null default 'cash'` check in
    (`'cash'`,`'bank'`).
  - paid tracking on `payroll_items` (or a join table): `paid_at timestamptz null`,
    `paid_method text null` — plus an RPC to mark a set of items paid (admin-only).
- **H-4 (daily pay):** confirm `compensation.pay_frequency` allowed values; add
  `daily_rate` if base_salary can't represent it; decide days-worked source
  (attendance vs manual). Wire `services/payroll-worker` to the daily engine path.
- **H-5 (payslip storage):** confirm/add storage RLS allowing an employee to read
  their own payslip PDF (needed for web download #5).

`TODO(db)` markers will be added in code at each gap and listed here as they land.
