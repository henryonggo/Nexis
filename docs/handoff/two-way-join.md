# Handoff — Two-way company join (invite + self-request) — 🟡 PROPOSED (Antigravity DB → Claude UI)

> **Owner:** Antigravity (join code, `company_join_requests`, RLS, RPCs, role-grant matrix) →
> Claude (join-by-code UI + approval queue UI). Tracking item per `docs/08-agent-boundaries.md`.
> Source: user request — make joining a company a two-way street.

## Goal

Today joining is **one-way**: an admin invites an email → the user registers → `accept_invitation`
links them (email must match — already enforced). Add the **second direction**: a newly registered
account can **request to join** an existing company itself, and owner/admin/HR **approves** and
assigns the role.

- **Invited path (exists):** email-matched accept. Keep as-is.
- **Self-request path (new):** user supplies a company **join code** → pending request → approver
  decides + assigns a role.
- **Email rule:** if the requester's email matches a pending invitation for that company, the
  invite path applies (email must match the invited email — existing `accept_invitation` check).
  The self-request path has no email constraint; the approver is the gate.

## Decisions (resolved)

1. **Role model — Option B: keep the 4 roles, no `hr`.** Authority limits live in the approve RPC,
   not in a new role (least-privilege without enum churn). The HR persona = `admin`. Grant matrix:
   | Approver | May approve a request as |
   |---|---|
   | **owner** | `admin`, `manager`, `employee` |
   | **admin** (the "HR/Admin" persona) | `manager`, `employee` — **never `admin`** (no self-escalation) |
   | manager / employee | — (not approvers) |
   Only **owner** and **admin** can approve join requests at all.
2. **Join key — company join code** (short, rotatable; no UUID leakage).

## TODO(db) — Antigravity

1. **Join code** — `companies.join_code text unique not null` (short, e.g. 8 chars, ambiguity-free
   alphabet), generated on company create. RPC `rotate_company_join_code(p_company_id)` —
   owner/admin only.
2. **`company_join_requests`** — `id, company_id, user_id, email (the registering email),
   status (pending|approved|rejected), created_at, decided_by, decided_at`. Unique partial index
   on `(company_id, user_id) where status = 'pending'` (no dup pending). RLS: requester reads own;
   **owner/admin** of the company read + decide the company's rows.
3. **`request_company_join(p_join_code text)`** — resolves company by code, inserts a pending
   request for `auth.uid()` with their auth email. Typed errors: `INVALID_CODE`, `ALREADY_MEMBER`,
   `ALREADY_PENDING`. Returns request id.
4. **`approve_join_request(p_request_id uuid, p_role company_role)`** — enforces, server-side:
   - caller is **owner or admin** of the company;
   - **grant matrix:** owner may set `admin`/`manager`/`employee`; admin may set `manager`/`employee`
     only. Reject `INSUFFICIENT_ROLE` otherwise (an admin can never mint an `admin`/`owner`);
   - if a pending invitation exists for the requester's email, honor the email-match rule;
   - creates the `company_members` row with `p_role` (+ links `employee_id` if an unclaimed
     employee row matches the email, like `accept_invitation` does), marks the request approved,
     writes an audit log.
5. **`reject_join_request(p_request_id uuid, p_note text default null)`** — owner/admin.
6. Grant execute to `authenticated`; pgTAP for the matrix (admin cannot grant admin; owner can; a
   non-owner/admin cannot approve; dup pending blocked; invited-email mismatch blocked).

## App follow-up — Claude (after RPCs land)

- **Join-by-code** on the post-registration / onboarding screen (`apps/web/app/(onboarding)`):
  alongside "Create company", a "Join existing company" form (enter code → `request_company_join`)
  + a pending-request state.
- **Approval queue** on `/members`: list pending `company_join_requests`; approve with a **role
  select whose options are limited by the caller's role** (data-driven from the matrix) / reject.
- **Join code display + rotate** on `/members` or `/settings` (owner/admin).
- i18n (id-ID default), e2e guard + happy path.

## Acceptance

- New account joins via code → request appears for owner/admin/HR → approved with a role →
  membership active; the new user lands in the company.
- admin can grant `manager`/`employee` but **never** `admin`; owner can grant `admin`/`manager`/`employee`.
- An invited user registering with a **different** email than invited cannot use the invite
  (existing check) and must self-request instead.
- Duplicate pending requests and non-member approvals are rejected.
