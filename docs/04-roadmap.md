# 04 — Roadmap (Stages, Dependencies, Acceptance Criteria)

Build **in order**. Do not begin a stage until the previous stage meets its acceptance criteria. Each stage has a detailed spec in `docs/stages/` (Stage 1 is fully specced; later stages give scope + acceptance criteria and should be expanded by the agent via deeper research before implementation).

## Stage 0 — Foundation / Scaffold (prerequisite)

**Goal:** working monorepo and connected services, no features yet.

Scope: Turborepo + pnpm workspaces; `apps/web` (Next.js), `apps/mobile` (Expo), `packages/types|ui|money|payroll`, `supabase/`, `services/payroll-worker`, `infra/gcp`. Supabase project created (local + staging). Supabase clients wired. CI pipeline (lint, typecheck, test, `supabase db lint`). Base i18n (id-ID/en). Design tokens from `06-design-system.md`.

**Acceptance:** `pnpm dev` runs web + mobile against local Supabase; CI green; `supabase gen types` produces `packages/types`.

---

## Stage 1 — Authentication ⭐ (START HERE — full spec: `stages/stage-01-auth.md`)

**Goal:** complete account lifecycle and the multi-company-ready foundation.

Scope:
- **Sign up** (email + password) with email verification.
- **Sign in** (email/password); session persistence on web (cookies) and mobile (AsyncStorage).
- **Forgot password / reset password** (email link).
- **Change password**, **resend verification**, **sign out**.
- Optional: **Google OAuth** sign-in (fits the GCP/Google ecosystem).
- **Onboarding after first signup:** create first company via `create_company_with_owner`. **Free tier: first 5 employees free, no company NPWP / legal fields required.** Only ask name + (optional) industry.
- **Company switcher** scaffold (one user → many companies) even if user has one company.
- `profiles`, `companies`, `company_members`, `company_settings`, `company_billing` tables + RLS + helper functions live (from `03-database-schema.md`).

**Acceptance:**
1. New user signs up, verifies email, lands in onboarding, creates a company, becomes its `owner`.
2. Forgot-password email arrives and resets successfully.
3. Sessions persist and refresh on web and mobile.
4. RLS pgTAP tests pass (cross-company isolation; owner-of-A/employee-of-B scenario).
5. No company NPWP collected on the free path; `company_billing.plan='free'`, `free_seat_limit=5`.

---

## Stage 2 — Companies, Members & Employees

**Goal:** manage the org and people; enforce the free seat limit.

Scope: company profile & settings; **invite members by email** with per-company role; accept-invite flow; company switcher fully functional; **employee CRUD** (employees, employment details, compensation, tax_profile, bank_accounts); employee self-profile (mobile); **free-seat trigger enforced** (6th active employee blocked on free plan with a clear upgrade prompt); departments/positions; org chart (basic).

**Acceptance:** owner invites an admin and an employee, each gets correct role; admin adds employees up to 5 on free, 6th is blocked with upgrade CTA; employee logs into mobile and sees only their own data; RLS verified.

---

## Stage 3 — Attendance & Scheduling

**Goal:** GreatDay-style attendance.

Scope: mobile **clock in/out** with **GPS geofence** + **selfie/liveness** capture (stored in Storage/GCS); work schedules & shifts; attendance approval/correction by admin/manager; tardiness/overtime detection feeding payroll; attendance dashboard (web) with **Realtime** live view; holiday calendar (Indonesian national holidays).

**Acceptance:** employee clocks in/out from mobile within geofence; record appears live on web; overtime hours computed and available to payroll; admin can correct records (audited).

---

## Stage 4 — Payroll Engine ⭐ (compliance-critical)

**Goal:** run compliant monthly payroll.

Scope: `packages/payroll` pure engine implementing `05-indonesian-compliance.md` (PPh 21 TER, BPJS employee+employer, overtime 1/173, deductions, net pay), exhaustively unit-tested against fixtures; **Cloud Run payroll worker** + Cloud Tasks queue + Realtime status; payroll draft → run → review → approve → mark paid; **payslip PDF** generation to Cloud Storage; **config snapshotting** for reproducibility; THR run type; gating: full automation requires paid plan / company NPWP for tax-affecting filing.

**Acceptance:** monthly run for a test company produces correct gross, BPJS (both sides), PPh 21 (TER, +20% no-NPWP case), and net pay matching hand-calculated fixtures to the rupiah; payslip PDFs downloadable; re-running after a rate change does not alter historical runs.

---

## Stage 5 — Leave & Reimbursement Claims

**Goal:** self-service requests with approvals.

Scope: leave types (Cuti Tahunan, Sakit, Melahirkan, etc.) + balances + accrual; leave request → manager approval → balance update; reimbursement claims with receipt upload + approval; approved items optionally flow into payroll; notifications (push on mobile via Expo, email on web).

**Acceptance:** employee requests leave on mobile; manager approves; balance decrements; approved reimbursement appears in next payroll; all role-gated and audited.

---

## Stage 6 — Reporting, Exports & Billing

**Goal:** make it sellable and filable.

Scope: reports (payroll summary, BPJS contribution report, **PPh 21 / e-Bupot export**, **BPJS SIPP export**); CSV/XLSX/PDF exports (heavy ones via Cloud Run); **billing & subscriptions** (Stripe or Indonesian gateway e.g. Midtrans/Xendit) — upgrade from free, seat-based pricing, collect company NPWP/BPJS numbers on upgrade; usage metering of active seats; invoices.

**Acceptance:** admin upgrades a company past 5 seats via a real payment flow (sandbox); NPWP/legal fields captured on upgrade; tax & BPJS exports generate in the expected formats; seat metering accurate.

---

## Stage 7 — Advanced / Scale (optional, prioritize by demand)

Scope (pick per market feedback): performance/KPI module; recruitment/ATS; loans & advances; multi-currency/expat handling; public **API & webhooks** (Open-API like GreatDay); SSO/SCIM for enterprise; advanced analytics dashboards (live Cowork artifact possible); audit & compliance center; mobile offline mode; WhatsApp notifications.

**Acceptance:** defined per chosen feature.

---

## Cross-cutting (every stage)

- RLS policies + pgTAP tests for any new tenant table.
- i18n for all new strings (id-ID + en).
- Audit-log writes for sensitive actions.
- Type regeneration after migrations.
- Accessibility & responsive checks on web; device testing on mobile.

## Dependency graph

```
Stage 0 ─▶ Stage 1 ─▶ Stage 2 ─▶ Stage 3 ─┐
                               └▶ Stage 4 ─┼─▶ Stage 6
                                  Stage 5 ─┘        │
                                                    └▶ Stage 7
```
Stage 4 depends on Stage 2 (employees/compensation) and benefits from Stage 3 (overtime). Stage 6 depends on 4 (+5).
