# ADR 0007 — Nexis Lite: cut the pre-pivot surface, one simple nav

- **Status:** Accepted for the web layer (2026-10-29, owner instruction:
  "simplify the whole process … make it light and approachable to a new
  company"). Schema cut is **Proposed** — needs the owner's go-ahead (see
  "Backend: proposed, not yet applied").
- **Context:** `docs/pivot/CODE-REVIEW-2026-07.md` ("the repo's real problem
  is pre-pivot surface area"), `docs/pivot/ROADMAP.md` ("each frozen surface
  is revived only when a paying workflow demands it — otherwise it eventually
  gets deleted, not maintained"), ADR 0001.
- **Deciders:** Owner (Boss); drafted by the orchestrator.

## Context

The web app shipped 21 nav entries split across five "pillars", with a
header tab bar, a pillar-filtered sidebar, a Ctrl-K command palette and a
per-company "flat vs pillars" setting for employees. A brand-new company had
to find its way through performance reviews, analytics, a developer API
console and a multi-company portal before reaching the one thing Nexis now
sells: the agent runs payroll, the owner approves. No paying workflow uses
any of those surfaces; they only cost maintenance and first-run confusion.

## Decision

1. **Delete** the frozen surfaces that feed nothing in payroll: performance,
   analytics, developer (API keys / webhooks console), glance, and the
   multi-company `/portal` — routes, libs, e2e specs, i18n keys.
   Git history is the archive; revive only when a paying workflow asks.
2. **Keep** everything that feeds net pay or is needed to operate payroll:
   employees, attendance/overtime, leave, claims, loans, earnings,
   deductions, payslips, reports, members, access, audit, settings, profile —
   and billing, because the free-seat trigger and the plan/NPWP approval gate
   are enforced in the database and need a working upgrade path. `/superadmin`
   stays too: it is the platform owner's tool for comping a company past
   those gates (allowlisted emails only, appended to the Perusahaan group).
3. **One grouped sidebar** replaces pillars + top tabs + command palette +
   the nav-style setting. Groups: (main) Beranda · Persetujuan · Penggajian;
   Tim; Gaji; Perusahaan. Role visibility and employee access flags are
   unchanged.
4. **Dashboard answers "what do I do next"**: a next-action card (pending
   approvals → `/approvals`, or "run the payroll agent") and a 4-step
   getting-started checklist ending at the first agent run. The attendance
   shifts step is dropped from onboarding — monthly payroll doesn't need it.

## Backend: proposed, not yet applied

The matching schema cut is deliberately **not** in the same change: it drops
tables on staging/production and can't be undone by a revert. Proposed as a
single db-engineer migration once the owner confirms the tables hold nothing
worth keeping (staging is currently paused, so row counts are unverified):

| Domain | Objects |
|---|---|
| Recruitment | `job_openings`, `candidates`, `applications`, `interviews` |
| Performance | `review_cycles`, `performance_goals`, `performance_reviews` |
| Public API / webhooks | `company_api_keys`, `api_request_logs`, `company_webhooks`, `webhook_queue`, `webhook_logs` + Edge Functions `public-api`, `dispatch-webhook` |
| SSO / SCIM | `company_sso`, `company_scim_tokens` + Edge Function `scim` |
| Portal | `portal_company_summaries()` RPC |
| Nav style | `company_employee_access.nav_style` column (no longer read or written) |

Then regenerate `packages/types` and delete the pgTAP tests for those
domains. Out of scope for that cut: billing, and anything listed as "not
freezable" in the code review (claims, loans, overtime/attendance, currencies).

## Consequences

- apps/web shrinks substantially; the nav a new owner sees fits on one screen.
- Reviving a deleted surface means restoring it from git and re-reviewing it
  against the current design system — intentionally a real cost.
- The mobile app is untouched (it never exposed the deleted surfaces).
- Until the schema cut lands, the frozen tables stay RLS-protected and
  unused; no security change either way.
