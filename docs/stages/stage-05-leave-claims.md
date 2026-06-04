# Stage 5 — Leave & Reimbursement Claims (Spec)

## Objective

Self-service leave and reimbursement with approval workflows; approved items can flow into payroll.

## Scope

**Leave**
- Leave types per company (Cuti Tahunan, Sakit, Melahirkan/maternity, Menikah, etc.), paid flag, default allocation.
- Leave balances per employee with accrual policy (e.g. 12 days/yr, prorated by join date); carry-over rules configurable.
- Request flow (mobile): pick type, dates, reason, optional attachment → status `pending`.
- Approval (manager/admin): approve/reject → balance decremented on approval; notifications.
- Calendar/team view of who's off; integrate with attendance (leave days excluded from absence).

**Reimbursement claims**
- Claim categories; submit amount (integer IDR) + receipt upload (private storage).
- Approval flow → `approved`/`rejected`; approved claims optionally included in the next payroll run as a non-taxable/ taxable line (configurable).
- Claim history & status per employee.

**Notifications**
- Expo push (mobile) + email (web) on submit/approve/reject.

## Data touched

`leave_types`, `leave_requests`, `leave_balances`, `claim_types`, `reimbursement_claims` (tenant-scoped RLS + employee self-insert/self-read; approver must be manager/admin of the same company).

## Acceptance criteria

1. Employee submits leave on mobile; manager approves; balance decrements correctly (incl. proration).
2. Rejection returns balance and notifies employee.
3. Reimbursement with receipt is submitted, approved, and appears in the next payroll run.
4. Notifications delivered on both channels.
5. RLS: employees act only on their own requests; only same-company managers/admins approve; balances not editable by employees.
6. Audit log records approvals/rejections.

## Cross-agent handoff — Stage 5 kickoff (added 2026-06-04)

> Appended per the append-only docs rule (08 §"Conflict-avoidance" #5). Claude is
> building the app layer against the desired shape below; Antigravity lands the
> migration + RLS + regenerated types in parallel (schema leads, app follows).

### ✅ Done — Claude (app layer, no DB dependency)
- **`@nexis/leave`** — pure, framework-free leave-balance engine (mirrors the
  `@nexis/payroll` pattern). 20 tests pass, typecheck green. Exposes the *method*
  (numbers are policy inputs): `annualEntitlement` / `accruedAsOf`
  (monthly end-of-month or annual-lump accrual, prorated by join month, gated by
  `minServiceMonths`), `carryOver` (capped), `countLeaveDays` (excludes
  weekends per workweek length + public holidays, half-day support),
  `availableBalance`, `validateLeaveRequest`. The app and the payroll worker
  should both consume this — do not re-implement the math.

### ▶️ `TODO(db)` — Antigravity: Stage 5 schema (proposed shape the app will code against)
Tenant-scoped, RLS on. Money is integer rupiah (bigint). Days are `numeric(4,1)`
(half-day). Enums: `leave_status` = pending|approved|rejected|cancelled;
`claim_status` = pending|approved|rejected|paid.

- `leave_types(id, company_id, name, paid bool, default_annual_days int,
  accrual_method text check in ('monthly','annual_lump'), min_service_months int,
  max_carry_over_days int, created_at)`
- `leave_balances(id, company_id, employee_id, leave_type_id, year int,
  opening_balance numeric(4,1), accrued numeric(4,1), used numeric(4,1),
  carried_over numeric(4,1), updated_at)` — unique `(employee_id, leave_type_id, year)`.
  **Employees may not write this** (only the approval flow / a SECURITY DEFINER
  RPC or service adjusts it).
- `leave_requests(id, company_id, employee_id, leave_type_id, start_date date,
  end_date date, days numeric(4,1), half_day bool, reason text,
  attachment_path text, status leave_status default 'pending',
  decided_by uuid, decided_at, decision_note text, created_at)`
- `claim_types(id, company_id, name, taxable bool, created_at)`
- `reimbursement_claims(id, company_id, employee_id, claim_type_id,
  amount bigint, description text, receipt_path text,
  status claim_status default 'pending', payroll_run_id uuid null,
  decided_by uuid, decided_at, decision_note text, created_at)`

Also needed (Antigravity):
- **Approval RPCs** (SECURITY DEFINER, assert same-company manager/admin) so the
  balance decrement on approve / restore on reject is atomic and not writable by
  employees: e.g. `approve_leave(request_id)`, `reject_leave(request_id, note)`,
  `approve_claim(...)`. Audit-log the decision (AC #6).
- **Private Storage** buckets + policies for `leave-attachments` and
  `claim-receipts` (employee self-read own; manager/admin same-company read).
- **Realtime publication:** add `leave_requests` + `reimbursement_claims` (and,
  carried over from Stage 4, `payroll_runs`) to `supabase_realtime` for approval
  dashboards.
- **Payroll integration (AC #3):** the payroll worker reads approved
  `reimbursement_claims` for the period and adds them as a (non-)taxable line;
  on completion sets `claim.status='paid'` + `payroll_run_id`. Coordinate the
  engine input shape with `@nexis/payroll`.
- **Notifications (AC #4):** Expo push tokens table + an Edge Function/worker to
  send push + email on submit/approve/reject.

Once types regenerate, Claude builds: mobile request/claim submit + history, web
approval dashboard + team calendar, balance views, and wires notifications.
