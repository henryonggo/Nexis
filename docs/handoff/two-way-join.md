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

## ⛔ Two decisions needed before build

1. **HR role.** The grant matrix names HR separately from admin, but `company_role` is
   `owner | admin | manager | employee` (no `hr`). Either:
   - **(A) HR = admin** — no enum change. Matrix collapses to: admin grants employee; owner grants
     admin/manager/employee. Ships fastest.
   - **(B) Add `hr` role** — Antigravity extends the enum + every role-gated RLS policy. Matrix as
     stated: HR grants employee only; owner/admin grant admin/hr/employee. Faithful but a large,
     cross-cutting DB change.
   *Defaulting to nothing until chosen — it changes the enum and the approve RPC.*
2. **Join key.** Recommended: a short **company join code** (rotatable, no UUID leakage).
   Alternatives: paste company UUID, or name search. Spec below assumes a join code.

## TODO(db) — Antigravity

1. **Join code** — `companies.join_code text unique not null` (short, e.g. 8 chars, ambiguity-free
   alphabet), generated on company create. RPC `rotate_company_join_code(p_company_id)` —
   owner/admin only.
2. **`company_join_requests`** — `id, company_id, user_id, email (the registering email),
   status (pending|approved|rejected), created_at, decided_by, decided_at`. Unique partial index
   on `(company_id, user_id) where status = 'pending'` (no dup pending). RLS: requester reads own;
   owner/admin/(hr) of the company read + decide the company's rows.
3. **`request_company_join(p_join_code text)`** — resolves company by code, inserts a pending
   request for `auth.uid()` with their auth email. Typed errors: `INVALID_CODE`, `ALREADY_MEMBER`,
   `ALREADY_PENDING`. Returns request id.
4. **`approve_join_request(p_request_id uuid, p_role company_role)`** — enforces, server-side:
   - caller is owner/admin/(hr) of the company;
   - **role-grant matrix** (per the HR decision above) — reject `INSUFFICIENT_ROLE` if the caller
     may not grant `p_role` (e.g. HR may only grant `employee`);
   - if a pending invitation exists for the requester's email, honor the email-match rule;
   - creates the `company_members` row with `p_role` (+ links `employee_id` if an unclaimed
     employee row matches the email, like `accept_invitation` does), marks the request approved,
     writes an audit log.
5. **`reject_join_request(p_request_id uuid, p_note text default null)`** — owner/admin/(hr).
6. Grant execute to `authenticated`; pgTAP for the matrix (HR cannot grant admin; owner can; a
   non-member cannot approve; dup pending blocked; invited-email mismatch blocked).

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
- HR can only grant `employee`; owner/admin can grant the wider set (per the chosen role model).
- An invited user registering with a **different** email than invited cannot use the invite
  (existing check) and must self-request instead.
- Duplicate pending requests and non-member approvals are rejected.
