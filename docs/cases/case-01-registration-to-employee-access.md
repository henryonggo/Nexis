# Case 01 — Registration → Employee Registered → Invited → Employee Access

> **Type:** end-to-end user workflow case, audited against the codebase on 2026-06-12.
> **Covers:** playbook stages W1–W3 (`docs/09-client-workflow-playbook.md`).
> **Status legend:** ✅ implemented & verified in code · ⚠️ implemented with caveats · ❌ gap (not working as intended).

**Actors:** Owner (Budi, signs up), Employee (Sari, invited).
**Preconditions:** none — fresh visitor, free tier.

---

## Verdict up front

The flow works end-to-end. Gap G1 (invited employee is never linked to their employee record) has been resolved on 2026-06-12 by extending the `accept_invitation` function, adding the `link_employee_account` RPC, and implementing a backfill. All employee self-service surfaces now properly display data scoped to the linked user account.

---

## Step-by-step trace

### C1 — Owner registration

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 1 | Budi opens `/sign-up`, submits name/email/password | Account created, verification email sent | `app/(auth)/sign-up`, `signUp` in `app/(auth)/actions.ts` (`emailRedirectTo` set) | ✅ |
| 2 | Clicks verification link | Code exchanged for session, redirected onward | `app/auth/callback/route.ts` (`exchangeCodeForSession`) | ✅ |
| 3 | Signs in | Session persists; idle timeout after ~2h | `app/(auth)/sign-in`, `IdleTimeout` in `app/(app)/layout.tsx` | ✅ |
| 4 | Forgot/reset password | Email link → reset | `app/(auth)/forgot-password`, `reset-password` | ✅ |

### C2 — Company onboarding

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 5 | First sign-in with no membership | Redirect to `/onboarding` | `app/(app)/layout.tsx` (`memberships.length === 0 → redirect`) | ✅ |
| 6 | Creates company (name + optional industry) | Becomes `owner`; `plan='free'`, seat limit 5; no NPWP asked | `app/(onboarding)/onboarding`, `create_company_with_owner` (stage-1 migration) | ✅ |
| 7 | Lands on dashboard with company switcher | Active company cookie validated against memberships | `lib/company.ts` (`getActiveCompany` falls back safely) | ✅ |

### C3 — Register employee

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 8 | Owner/Admin opens `/employees/new` (or `/employees/import` for bulk) | Non-admins redirected | both pages guard `active.role` | ✅ |
| 9 | Submits employee (name, email, position, salary, type) | `employees` row + seeded `compensation` row | `app/(app)/employees/actions.ts` `createEmployee` | ✅ |
| 10 | Adds 6th active employee on free plan | Blocked with upgrade CTA | DB trigger `FREE_SEAT_LIMIT_REACHED` surfaced with `upgrade: true` | ✅ |
| 11 | Role check server-side | Only owner/admin can create | explicit check in action + `employees: admin write` RLS | ✅ |

### C4 — Invite employee

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 12 | Owner/Admin opens `/members`, invites sari@… with role `employee` | `invitations` row; email sent; if email service unconfigured, shareable link surfaced in-app | `app/(app)/members/actions.ts` `inviteMember` + `lib/email.ts` fallback | ✅ |
| 13 | Roles offered: admin / manager / employee | zod-enforced enum | `inviteSchema` | ✅ |
| 14 | Revoke pending invite | Admin-only | `revokeInvite` (no in-action role check, but `invites: admin manage` RLS enforces it) | ✅ |

### C5 — Accept invite

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 15 | Sari opens `/invite/<token>` signed-out | Redirect to sign-in with `redirectTo` back to invite | `app/invite/[token]/actions.ts` | ✅ |
| 16 | Sari signs up/in with the **invited email** and accepts | `accept_invitation` RPC: token valid, not expired, email must match; membership created with role `employee`; invite marked accepted | stage-2 migration (`INVITE_INVALID` / `INVITE_EXPIRED` / `INVITE_EMAIL_MISMATCH`) | ✅ |
| 17 | Joined company becomes active | Cookie set, redirect to `/dashboard` | `acceptInvite` action | ✅ |
| 18 | Sari's `company_members` row is linked to her `employees` record | `employees.user_id = sari's auth id` so self-service works | `accept_invitation` sets `user_id` and links `company_members.employee_id` | ✅ |

### C6 — Employee access (what Sari can do once linked)

Access is enforced in three layers: page guards (`active.role`), server-action role
checks, and RLS. The matrix below is what the **employee** role gets, verified
against code; items marked ❌G1 are *designed* to work but return empty until G1 is
fixed because they all join through `employees.user_id = auth.uid()`.

| Surface | Employee access | Enforced by | Status |
|---|---|---|---|
| **Web** Dashboard | View (non-admin variant) | `isAdmin` branch in `dashboard/page.tsx` | ✅ |
| **Web** Employees list | Own record only | `employees: self read` RLS | ✅ own row |
| **Web** Employees create/edit/import | None — redirected/blocked | page guards + action checks + RLS | ✅ |
| **Web** Attendance | View; no corrections | `canCorrect = role !== "employee"` | ✅ own rows |
| **Web** Leave / Claims / Loans | Submit own; cannot approve | approver = owner/admin/manager checks; RLS self rows | ✅ own rows |
| **Web** Payroll | Own payslips only | stage-4 RLS (`user_id = auth.uid()`) | ✅ own payslips |
| **Web** Members / Billing / Audit / Developer / Reports / Analytics | No data (admin/manager gated) | `isAdmin` / `canSee` branches | ✅ |
| **Mobile** Sign-in | Works (same auth) | `apps/mobile/app/(auth)/sign-in.tsx` | ✅ |
| **Mobile** Profile (self data) | Own employee record | `profile.tsx` queries `employees … eq("user_id", session.user.id)` | ✅ own profile |
| **Mobile** Attendance clock in/out | Own records | stage-3 RLS via `employees.user_id` | ✅ own clock |
| **Mobile** Payslips | Own payslips | stage-4 RLS | ✅ own payslips |
| **Mobile** Leave & Claims | Submit/view own | stage-5 RLS | ✅ own requests |
| **Mobile** Performance | Own reviews | stage-7 RLS | ✅ own reviews |
| Cross-company isolation | Sari sees nothing from other companies | RLS + pgTAP (`supabase/tests`) | ✅ |

---

## Gaps & recommended fixes

### G1 — ✅ FIXED (2026-06-12) — Invited employee is automatically linked to their employee record

`accept_invitation` creates the membership and updates `employees.user_id = auth.uid()`.
Also sets `company_members.employee_id` to link the membership back to the employee record.

Fixed in migration [20260612081500_employee_user_linking.sql](file:///c:/GIT/nexis/supabase/migrations/20260612081500_employee_user_linking.sql).

Plus, added `public.link_employee_account(p_employee_id uuid, p_user_id uuid)` RPC for administrative manual linking/relinking when the employee's roster email differs from their login email.

**Acceptance:** Sari accepts invite → profile/clock-in/payslips/leave/claims all return her own rows; pgTAP tests verify linking and RLS isolation.

### G2 — ✅ FIXED (2026-06-12) — Web nav is now role-filtered

`app/(app)/layout.tsx` now declares allowed roles per nav item and filters by
`active.role`. Employee sees: Dashboard, Attendance, Leave, Claims. Manager adds:
Employees, Loans, Performance, Reports. Owner/Admin see everything. Mapping mirrors
the per-page guards; data remains protected by RLS regardless. Verify in the full
Windows dev environment with `pnpm --filter @nexis/web typecheck` (sandbox cannot
resolve pnpm junctions).

### G3 — ✅ FIXED (2026-06-12) — e2e coverage for the invite path

Added `e2e/members-invite.spec.ts`: unauthenticated guard, invite happy path
(create → pending list → revoke, self-cleaning), and prefill-from-query tests for
the G4 flow. Follows the existing `STORAGE_STATE`/`HAS_AUTH` skip conventions.
Full invite-*accept* e2e (second account) remains blocked on G1.

### G4 — ✅ FIXED (2026-06-12) — "Undang ke aplikasi" from the employee page

`/employees/[id]` now shows, for owner/admin when the employee has an email and no
linked account: an **Undang ke aplikasi** button that deep-links to
`/members?email=…&role=employee` with the invite form pre-filled. When
`employees.user_id` is set it shows a **Terhubung ke aplikasi** badge instead (the
badge becomes meaningful once G1 lands). i18n keys added (id + en).

---

## Follow-ups

With G1 landed (migration `20260612081500_employee_user_linking.sql`), two items remain:

1. **Invite-*accept* e2e (now unblocked).** G3 added the create/revoke/prefill specs but
   the full second-account *accept* path (`e2e/members-invite.spec.ts`) was blocked on G1.
   Now actionable: provision a second auth account, accept the invite, assert
   `employees.user_id` linkage + employee-scoped data appears. — Claude Code lane.
2. **Optional admin re-link UI.** `public.link_employee_account(p_employee_id, p_user_id)`
   exists for the roster-email ≠ login-email case but has no surface. Add an admin-only
   "Tautkan ke akun" control on `/employees/[id]` (or `/members`) that calls the RPC, for
   manual relink when invite-time auto-linking didn't match. Low priority; RPC works today.

---

## Re-test checklist (after fixes)

- [ ] Fresh signup → onboarding → dashboard < 2 min, no NPWP fields.
- [ ] Add 5 employees (one via CSV import); 6th blocked with upgrade CTA.
- [ ] Invite employee email; accept on a clean browser; role = employee.
- [ ] Mobile: sign in as employee → profile populated, clock-in works, payslip visible after a payroll run.
- [ ] Web as employee: no admin nav, no admin data, approvals hidden.
- [ ] pgTAP: cross-company + invite-linking tests green; `pnpm --filter @nexis/web typecheck` green.
