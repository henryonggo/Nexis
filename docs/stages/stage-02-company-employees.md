# Stage 2 — Companies, Members & Employees (Spec)

> Builds on Stage 1. The agent should expand this spec with deeper research (e.g. Indonesian employee data fields, BPJS/NIK formats) before implementation.

## Objective

Manage organizations and people: invite teammates with per-company roles, run the company switcher for real, and do full employee management — while enforcing the **free 5-employee limit**.

## Scope

**Company management**
- Company profile & settings screen (name, logo upload, timezone, locale, workweek, payroll cutoff/pay date, JKK risk class).
- `company_billing` view (plan, seat usage). Legal/tax fields (NPWP, BPJS numbers) shown but **optional while free**.
- Create additional companies (a user can own many) — reuses `create_company_with_owner`.

**Members & roles**
- Invite by email with role (`admin`/`manager`/`employee`) → `invitations` row + email with token link.
- Accept-invite flow: signed-in or sign-up-then-accept; `SECURITY DEFINER` `accept_invitation(token)` matches email, creates `company_members` row, marks invite accepted/expired.
- Members list with role management (owner/admin only); remove member (audited). Cannot remove last owner.
- Company switcher fully wired (active-company context drives all queries).

**Employees**
- Employee CRUD: `employees`, `employment_details`, `compensation`, `tax_profile`, `bank_accounts`.
- Fields: name, employee_no, email/phone, join date, employment type, department, position, manager, status; compensation (base salary integer IDR, fixed allowances, BPJS/JHT/JP enrollment toggles); tax (PTKP status, NPWP optional, has_npwp); bank account.
- Link an employee to a login (`employees.user_id`) — when an invited `employee`-role member is also paid staff.
- Employee self-profile on mobile (read own data; edit limited fields).
- Bulk import employees via CSV/XLSX (validate, preview, commit).

**Free-seat enforcement**
- Activate the `enforce_free_seat_limit` trigger now (it references `employees`).
- UI: at 5/5 active employees on free plan, block the 6th with a clear upgrade CTA (banner + dialog). Error code `FREE_SEAT_LIMIT_REACHED` surfaces as a friendly i18n message.

## Data touched

`companies`, `company_members`, `company_settings`, `company_billing`, `invitations`, `employees`, `compensation`, `tax_profile`, `bank_accounts` (+ RLS already defined in `03-database-schema.md`; add employee **self-read** policies).

## Acceptance criteria

1. Owner invites an admin + an employee; both receive working invite links and land with the correct role.
2. Admin creates employees up to 5 on free plan; the 6th active employee is blocked with an upgrade prompt.
3. Employee signs into mobile and sees only their own employee record (RLS verified).
4. Company switcher lets a multi-company user move between companies; queries re-scope correctly.
5. CSV import validates and creates employees; bad rows reported, not silently dropped.
6. pgTAP: role-gated writes (only owner/admin can modify employees/members; manager cannot; employee cannot).
7. Audit log records member add/remove and role changes.
