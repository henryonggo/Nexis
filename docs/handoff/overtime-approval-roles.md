# Handoff — Overtime approval: allow managers — 🟡 OPEN (Antigravity)

> **Owner:** Antigravity (RLS) → Claude (app follow-up). Tracking item per
> `docs/08-agent-boundaries.md`. Source: `docs/cases/case-02-attendance-to-first-payroll.md` step 30.

## Problem

Case-02 step 30 specifies **managers** approve overtime. The shipped RLS on
`overtime_entries` (migration `20260612161700_overtime_pipeline.sql`) restricts writes to
`user_is_company_admin(company_id)` = **owner/admin only**. The web approval queue is
currently gated to owner/admin to match RLS, so managers cannot approve. Decision: managers
*should* be able to approve.

## TODO(db) — Antigravity

Widen the overtime write policy to include the `manager` role. Two clean options:

1. Add a helper `public.user_is_company_manager_or_admin(target uuid)` →
   `role in ('owner','admin','manager')`, and use it in the `overtime: admin modify` policy
   (`using` + `with check`). Keep the existing employee policies untouched.
2. Or inline `role in ('owner','admin','manager')` in that one policy.

Keep `is_approved` integrity: an employee must still not approve their own overtime.

## App follow-up — Claude (after RLS lands)

In `apps/web/app/(app)/attendance/`:
- `actions.ts` `approveOvertime`/`rejectOvertime`: widen the gate from owner/admin to
  `role !== "employee"`.
- `page.tsx`: set `canApproveOvertime = canCorrect` (managers see the queue again).

## Acceptance

- A manager approves and rejects a pending overtime entry without a 42501.
- An employee still cannot approve their own.
