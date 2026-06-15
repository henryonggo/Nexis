# Spec — Multi-company / accountant portal — 🟡 PROPOSED (Antigravity role + Claude UI)

> **Owner:** Antigravity (new role enum + RLS) → Claude (cross-company UI). Post-beta.
> Source: `docs/10-beta-workflow-painpoints.md` "NOT in beta" (accountant portal).

## Current state (already built)

- `company_members` maps `user_id → {company_id, role}`; `lib/company.ts` `getMemberships()`
  returns **all** companies a user belongs to; the active company is a cookie, switchable.
- So a user already in multiple companies can switch between them. The missing pieces are a
  **cross-company view** and a **limited external-accountant role**.

## Delta to scope

### A. Accountant role (Antigravity — DB)

`company_role` enum is `owner | admin | manager | employee`. An external accountant needs
**read access to payroll + reports across several client companies, no employee edits**.

**Decision needed (product):** add a new `accountant` enum value, or reuse a read-only `admin`?
Recommend a distinct `accountant` role — cleaner RLS and audit story.

- `TODO(db)` (Antigravity): add `accountant` to `company_role`; RLS grants it **read** on
  `payroll_runs`, `payroll_items`, `payslips`, reports, and company billing summary, but **no**
  write anywhere and **no** access to employee PII beyond what a payslip needs. pgTAP for the
  read/write boundary. Regenerate types.

### B. Cross-company overview (Claude — app)

- A portal landing (e.g. `/portal`) that, for a user with ≥2 memberships, aggregates per-company
  cards: plan, headcount, last run status, pending approvals, next payroll due — each linking
  into that company (sets the active-company cookie).
- Built from `getMemberships()` + a small per-company summary read (reuse `lib/analytics`).
- Accountant-scoped nav: hide employee/attendance/leave management; show payroll + reports only.

### C. Invite flow (reuse)

Members invite is already per-company; inviting an accountant = invite to each client company
with role `accountant`. No new invite plumbing — just the new role in the role picker.

## Sequencing

Antigravity lands the `accountant` role + RLS first; then Claude builds the portal + role-scoped
nav. The cross-company overview (B) can be prototyped for existing multi-membership users
(owner/admin) before the role lands, since memberships already exist.

## Acceptance

- An accountant invited to 3 companies sees all 3 on the portal, opens each, reads payroll +
  reports, and is blocked from any write or employee PII.
- A single-company user is unaffected (portal optional / hidden).

## Risk

Cross-tenant data is the highest-blast-radius RLS change in the app — the accountant read scope
must be pgTAP-proven before any UI ships.
