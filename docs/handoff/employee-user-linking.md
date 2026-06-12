# Handoff — Employee ↔ User Account Linking (Case-01 G1)

> **Status:** app layer ready (Claude), **implemented & verified in DB (Antigravity)**.
> This doc is the `TODO(db)` tracking item per `docs/08-agent-boundaries.md`.
> Full audit trail: `docs/cases/case-01-registration-to-employee-access.md`.

## Problem (one paragraph)

`accept_invitation` (stage-2 migration) inserts the `company_members` row but never
sets `employees.user_id`. Every employee self-service surface — mobile profile,
clock-in, payslips, leave, claims, performance — filters on
`employees.user_id = auth.uid()`. Result: an invited employee signs in successfully
and sees an empty app. This blocks playbook stages W4–W6 for real employees.

## What's already built (Claude, app layer — shipped 2026-06-12)

- "Undang ke aplikasi" button on `/employees/[id]` → pre-filled invite form on
  `/members` (`?email=…&role=employee`).
- "Terhubung ke aplikasi" badge on `/employees/[id]` when `employees.user_id` is set
  — renders meaningfully as soon as this migration lands, no app change needed.
- Role-filtered nav; `e2e/members-invite.spec.ts` (guard + invite + prefill).
- No `packages/types` regeneration needed for the core fix: `employees.user_id`
  already exists in the schema. (Regenerate only if you add the RPC in §Optional.)

## TODO(db) — required for Antigravity

### 1. Extend `accept_invitation` (stage-2 function, `security definer`)

After the `company_members` upsert, link any unclaimed employee records matching the
invited email in that company:

```sql
update public.employees
set user_id = auth.uid()
where company_id = v_inv.company_id
  and lower(email) = lower(v_email)
  and user_id is null;
```

Notes:
- `v_email` is the caller's verified auth email, already validated against the
  invite (`INVITE_EMAIL_MISMATCH`), so linking by it is safe.
- `user_id is null` guard: never re-link an already-claimed record.
- If multiple employee rows share the email within the company, linking all of them
  is acceptable for v1 (same person); add a unique partial index if you'd rather
  forbid it: `create unique index on employees(company_id, lower(email)) where user_id is null;` — your call.
- Do **not** link across companies (the `company_id` predicate is load-bearing).

### 2. Backfill for already-accepted invites

One-time `update` joining `invitations` (status `accepted`) → `auth.users` by email
→ `employees` (same company, `user_id is null`), same predicates as above.

### 3. pgTAP tests (`supabase/tests`)

- Accept invite → `employees.user_id` set for the matching email in that company only.
- Email-mismatch invite still raises `INVITE_EMAIL_MISMATCH` and links nothing.
- Already-linked employee row is not overwritten by a second accept.
- Cross-company: same email in company B is NOT linked when accepting company A's invite.
- After linking: employee can `select` own row via `employees: self read`; sees own
  attendance/payslip/leave rows; still cannot see other employees.

### 4. Optional (nice-to-have, separate)

`link_employee_account(p_employee_id uuid, p_user_id uuid)` admin RPC for manual
re-link when the employee's roster email ≠ their login email. If added, regenerate
`packages/types`; Claude will then build the admin UI control on `/employees/[id]`.

## Acceptance (definition of done for this handoff)

1. New flow: add employee with email → invite same email → accept → mobile Profile
   populated; clock-in, payslips, leave, claims all return the employee's own rows.
2. Backfill: pre-existing accepted invites are linked.
3. All pgTAP tests above green; existing isolation tests still green.
4. `docs/cases/case-01` G1 flipped to ✅ and its re-test checklist runs clean.

## Follow-ups that return to Claude after the migration

- e2e: extend `members-invite.spec.ts` with the full accept path (second test
  account) now that acceptance produces a usable employee session.
- If §4 RPC is added: manual re-link UI on `/employees/[id]`.
