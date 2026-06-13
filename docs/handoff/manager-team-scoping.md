# Handoff — Manager "own team" scoping — 🟡 OPEN (Antigravity)

> **Owner:** Antigravity (RLS + approval RPCs) → Claude (minor app follow-up).
> Tracking item per `docs/08-agent-boundaries.md`. Source: `docs/10-beta-workflow-painpoints.md`
> role-access matrix (Manager = "own team" on every approval surface).

## Problem

The role-access spec says a **manager** acts only on their **own team** — attendance board,
attendance correction, overtime approval, leave approval, claims approval. The data model is
ready (`employees.manager_id` → `employees.id`, a direct-report link), but **no policy or RPC
uses it**. Every manager surface is currently **company-wide**:

- `overtime_entries` — `user_is_company_manager_or_admin(company_id)`
  (`20260612161700_overtime_pipeline.sql` + `20260613111500_handoff_updates.sql`).
- `leave_requests`, `reimbursement_claims` — `user_role_in_company(company_id) in
  ('owner','admin','manager')` (`20260604120000_stage5_leave_claims.sql`), and the
  `approve_*`/`reject_*` RPCs in the same file gate the same way.
- `attendance_records` correction + read — manager sees all employees, not just reports.

Result: a manager can approve/correct any employee in the company, violating the matrix.

## TODO(db) — Antigravity

1. **Helper** (one source of truth, `security definer`, `search_path = public`):

   ```sql
   -- true if caller is owner/admin of the company, OR is the direct manager of p_employee_id
   create or replace function public.user_can_manage_employee(p_employee_id uuid)
   returns boolean ...
   ```

   - Owner/admin → always true (full company).
   - Manager → true only when `p_employee_id`'s `employees.manager_id` resolves to the
     caller's own `employees.id` in that company.
   - **Scope decision:** direct reports only (one level). Transitive (manager-of-manager)
     is a later option — note it, don't build it now.

2. **Apply** to the manager-writable surfaces, keeping owner/admin full access and the
   existing self-approval blocks:
   - `overtime_entries` "overtime: admin modify" `using`/`with check`.
   - `leave_requests` approval policy + `approve_leave` / `reject_leave` RPCs.
   - `reimbursement_claims` approval policy + `approve_claim` / `reject_claim` RPCs.
   - `attendance_records` correction policy + the manager read path (board).

3. **pgTAP:** manager approves a direct report; manager is **blocked** on a non-report;
   owner/admin approves anyone; employee still blocked.

4. Regenerate `packages/types` (new function only; no column change).

## App follow-up — Claude (after RLS lands)

Mostly automatic — the web queues already read RLS-filtered rows, so a manager will simply
see only their team's pending items. Verify:
- App role gates stay `role !== "employee"` (RLS does the team narrowing now).
- Optional copy: label the manager's queues as "your team" where it adds clarity.

## Acceptance

- Manager sees + approves only direct reports' overtime / leave / claims / attendance.
- Owner/admin unchanged (full company).
- Employee cannot approve anything.

## Beta note

Not in the `docs/10` G5/G6/G7 blocker list — with a ≤5-employee single-team beta, company-wide
manager scope ≈ team scope, so this is **medium** priority. It is, however, the only unmet
Antigravity-lane contract the role matrix promises, so it should land before multi-team companies.
