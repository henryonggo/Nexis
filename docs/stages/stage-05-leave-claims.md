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
