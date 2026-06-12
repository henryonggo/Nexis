# 09 — Client Workflow Playbook

> **What this is:** the standard, reusable template for how a client company moves
> through Nexis — from first signup to steady-state monthly payroll and upgrade.
> Use it to (a) audit the live product against the intended journey, (b) onboard new
> clients consistently, and (c) prioritize UX and AI-agent improvements per stage.
>
> **Relationship to other docs:** product roadmap stages live in `04-roadmap.md`
> (what we *build*); this doc describes what a *client experiences* (what they *do*).
> The two are mapped in §1.

---

## 0. How to read each stage

Every stage uses the same template:

| Field | Meaning |
|---|---|
| **Goal** | The outcome the client gets from this stage |
| **Entry criteria** | What must be true before the stage starts |
| **Inputs** | Data/decisions the client (or Nexis) must supply |
| **Activities** | What happens, in order |
| **Outputs** | Artifacts/state produced |
| **Milestone** | The single event that marks the stage "done" |
| **Success criteria** | Measurable definition of done + health metrics |
| **UX improvements (human)** | Checklist of friction points to attack now |
| **AI-agent readiness** | What would let an AI agent perform this stage on the client's behalf later |

Personas (from `00-product-vision.md`): **Owner**, **HR/Finance Admin**, **Accountant
(multi-company)**, **Employee (mobile)**.

---

## 1. Lifecycle at a glance

```
W1 Signup ─▶ W2 Company setup ─▶ W3 Workforce setup ─▶ W4 Attendance go-live
                                                            │
                              W6 Self-service adoption ◀────┤
                                                            ▼
                                  W5 First payroll run (ACTIVATION ★)
                                                            │
                                                            ▼
        W8 Upgrade & billing ◀── W7 Steady-state monthly cycle (recurring loop)
                                                            │
                                                            ▼
                                  W9 Growth & multi-company expansion
```

| Workflow stage | Primary persona | Maps to build stage (`04-roadmap.md`) |
|---|---|---|
| W1 Signup & account | Owner / Accountant | Stage 1 |
| W2 Company setup | Owner | Stage 1–2 |
| W3 Workforce setup | Admin | Stage 2 |
| W4 Attendance go-live | Admin + Employees | Stage 3 |
| W5 First payroll run ★ | Admin | Stage 4 |
| W6 Self-service adoption | Employees + Manager | Stage 5 |
| W7 Steady-state monthly cycle | Admin | Stages 3–5 |
| W8 Reporting, filing & upgrade | Owner/Admin | Stage 6 |
| W9 Growth & expansion | Accountant / Owner | Stages 2, 7 |

**North-star activation metric:** time from signup → first approved payroll run
("time-to-first-payroll", target ≤ 7 days for a ≤5-employee company).

---

## W1 — Signup & account

- **Goal:** verified account with a working session on web (and mobile if relevant).
- **Entry criteria:** none (top of funnel).
- **Inputs:** name, email, password (or Google OAuth).
- **Activities:** sign up → verify email → sign in → land in onboarding.
- **Outputs:** `profiles` row; verified session; empty company state.
- **Milestone:** first authenticated session after email verification.
- **Success criteria:**
  - Verification email arrives < 1 min; reset flow works end-to-end.
  - Signup → verified conversion ≥ 80%; drop-off measured per step.
- **UX improvements (human):**
  - [ ] Resend-verification visible without hunting; clear spam-folder hint.
  - [ ] id-ID copy reviewed by a native speaker; error states humane, not codes.
  - [ ] Google OAuth offered up front to skip the verification wait entirely.
  - [ ] 2-hour inactivity sign-out: warn before expiry; preserve unsaved form state.
- **AI-agent readiness:**
  - [ ] Support API-key / machine credentials scoped per company (Stage 7 API) so an
        agent never handles a human password.
  - [ ] OAuth device/PKCE flow for agent-driven account linking.

## W2 — Company setup (free tier)

- **Goal:** first company created with the minimum legal-free footprint.
- **Entry criteria:** W1 milestone.
- **Inputs:** company name (+ optional industry). **Deliberately nothing else** — no
  NPWP/tax IDs on the free path (vision rule: collect only when tax-affecting).
- **Activities:** onboarding form → `create_company_with_owner` → user becomes Owner →
  company switcher seeded → `company_billing.plan='free'`, `free_seat_limit=5`.
- **Outputs:** `companies`, `company_members`, `company_settings`, `company_billing`
  rows; RLS-isolated tenant.
- **Milestone:** dashboard renders for the new active company.
- **Success criteria:** onboarding completes in < 2 minutes; zero NPWP fields shown;
  isolation pgTAP tests green.
- **UX improvements (human):**
  - [ ] Post-create "next 3 steps" checklist on the dashboard (add employees → set
        schedule → run payroll) instead of an empty dashboard.
  - [ ] Defaults pre-filled: timezone, national holiday calendar, standard work week.
  - [ ] Accountant path: "I manage multiple clients" branch that streamlines creating
        company #2, #3 from the switcher.
- **AI-agent readiness:**
  - [ ] `create_company_with_owner` callable via API with idempotency key.
  - [ ] Machine-readable onboarding state (e.g. `company_settings.setup_checklist`
        JSON) so an agent can query "what's left to configure?" instead of scraping UI.

## W3 — Workforce setup

- **Goal:** all staff in the system with correct compensation/tax data; admins invited.
- **Entry criteria:** W2 milestone.
- **Inputs:** per employee — identity, employment details, compensation (integer
  rupiah), tax profile (PTKP status, NPWP yes/no), bank account; member invites + roles.
- **Activities:** invite admin(s) by email → accept-invite → employee CRUD up to 5 free
  seats → employees invited to mobile self-profile → 6th active employee blocked with
  upgrade CTA.
- **Outputs:** populated employee tables; role-correct `company_members`; departments/
  positions.
- **Milestone:** every active employee has complete payroll-blocking fields (comp, tax
  profile, bank account).
- **Success criteria:** 0 employees with missing payroll-blocking data at W5 entry;
  invite acceptance ≥ 90%; seat-limit block fires with a clear, non-punitive prompt.
- **UX improvements (human):**
  - [ ] Bulk import (CSV/XLSX template) — typing 5–20 employees by hand is the single
        biggest onboarding friction.
  - [ ] "Payroll-readiness" badge per employee showing exactly which field is missing.
  - [ ] Inline PTKP/BPJS explainers in plain Bahasa — admins shouldn't need to know
        tax jargon to pick a status.
  - [ ] Invite flow works even if the invitee has an existing Nexis account
        (accountant-of-many case).
- **AI-agent readiness:**
  - [ ] Validated bulk-upsert endpoint with row-level error report (machine-parseable)
        so an agent can import from a client's spreadsheet and fix rejects.
  - [ ] Field-level validation rules exposed as schema (what makes an employee
        "payroll-ready"), not just buried in UI forms.

## W4 — Attendance go-live

- **Goal:** employees clocking in/out daily; data clean enough to feed payroll.
- **Entry criteria:** W3 milestone; geofence + schedule configured.
- **Inputs:** office location(s)/geofence radius, work schedules & shifts, holiday
  calendar; employees with the mobile app installed.
- **Activities:** employees clock in/out (GPS + selfie/liveness) → admin watches the
  Realtime dashboard → corrections/approvals (audited) → tardiness & overtime detected.
- **Outputs:** daily attendance records; overtime hours queued for payroll.
- **Milestone:** one full work week with ≥ 95% of expected clock events captured.
- **Success criteria:** correction rate < 5% of records; overtime figures match
  schedule rules; mobile clock-in < 10 seconds end-to-end.
- **UX improvements (human):**
  - [ ] First-clock-in tutorial on mobile (permissions for GPS/camera are the failure
        hotspot — handle denial gracefully with fix-it instructions).
  - [ ] Offline/poor-signal queueing for clock events (field workers).
  - [ ] Admin exception view: "who's missing today" beats a raw event log.
  - [ ] Correction flow ≤ 2 clicks from the exception, reason required, audit-logged.
- **AI-agent readiness:**
  - [ ] Attendance anomaly feed (late, missing, geofence-violation) as structured
        events/webhooks an agent can subscribe to and triage.
  - [ ] Correction API with mandatory reason + actor identity so agent actions stay
        audit-clean and distinguishable from human ones.

## W5 — First payroll run ★ ACTIVATION

- **Goal:** first compliant monthly payroll: correct PPh 21 (TER), BPJS (both sides),
  overtime 1/173, net pay to the rupiah; payslips delivered.
- **Entry criteria:** W3 complete; ideally one W4 cycle for overtime; pay-period
  decisions made (cutoff date, pay date).
- **Inputs:** attendance/overtime for the period; any one-off allowances/deductions;
  confirmation of company BPJS enrollment status.
- **Activities:** create draft → engine computes (config snapshot taken) → admin
  reviews per-employee breakdown → approve → mark paid → payslip PDFs generated →
  employees view payslips on mobile.
- **Outputs:** immutable payroll run + snapshot; payslip PDFs in storage; payment
  summary for the bank transfer.
- **Milestone:** run approved and marked paid; payslips downloadable.
- **Success criteria:** figures match hand-calculated fixtures exactly; no-NPWP +20%
  surcharge applied where relevant; re-running after a rate change never mutates this
  run; admin completes review in one sitting.
- **UX improvements (human):**
  - [ ] "Explain this number" on every payslip line — show the TER bracket, BPJS cap,
        and formula in plain language. Trust in the math is the product.
  - [ ] Pre-run validation gate listing every blocking issue before the draft (missing
        bank account, missing tax profile) — never fail mid-run.
  - [ ] Side-by-side diff vs. the previous run (first run: vs. expected gross).
  - [ ] Bank-transfer-ready export grouped by bank.
- **AI-agent readiness:**
  - [ ] Full run lifecycle (draft/compute/review/approve/paid) as API state machine
        with explicit states and allowed transitions; Realtime status already exists —
        expose it to API consumers too.
  - [ ] **Human-approval hard gate:** agents may prepare and validate a draft but the
        approve step requires a human credential. Encode this in policy, not convention.
  - [ ] Machine-readable calculation trace per payslip line (the "explain" data) so an
        agent can verify and answer employee questions.

## W6 — Self-service adoption

- **Goal:** leave & reimbursement flow through the app, not WhatsApp/paper.
- **Entry criteria:** W3 milestone; leave types + balances configured; managers
  assigned.
- **Inputs:** leave policy (Cuti Tahunan, Sakit, Melahirkan…), accrual rules, approval
  chain; receipt for claims.
- **Activities:** employee requests on mobile → manager approves/rejects (note on
  reject) → balance updates → approved reimbursements flow into the next payroll →
  push/email notifications.
- **Outputs:** leave ledger; claims with receipts; payroll-bound approved items.
- **Milestone:** first month where > 80% of leave/claims originate in-app.
- **Success criteria:** median approval latency < 24h; balances always reconcile;
  every action role-gated and audited.
- **UX improvements (human):**
  - [ ] Balance visible *before* requesting; conflict warnings (team calendar).
  - [ ] Receipt capture: camera-first, auto-crop, size-tolerant.
  - [ ] Manager approval from the push notification itself (one tap).
  - [ ] Rejection requires a reason; employee sees it verbatim.
- **AI-agent readiness:**
  - [ ] Policy-as-data for leave rules so an agent can pre-validate a request and
        predict the balance outcome.
  - [ ] Receipt OCR hook point (agent extracts amount/vendor/date, human confirms).
  - [ ] Approval API with delegated, scoped authority (e.g. agent may auto-approve
        claims < Rp X for category Y; everything else escalates to a human).

## W7 — Steady-state monthly cycle (the recurring loop)

This is the template clients repeat every month. Treat it as a checklist with owners
and dates relative to payday (D):

| When | Step | Owner | Output |
|---|---|---|---|
| D-7 | Attendance cutoff: resolve exceptions/corrections | Admin | clean attendance period |
| D-7 | Approve pending leave/claims bound for this run | Manager | payroll-bound items final |
| D-5 | Pre-run validation (blocking-issue list empty) | Admin | green readiness check |
| D-5 | Create draft run; review per-employee diffs vs last month | Admin | reviewed draft |
| D-3 | Approve run | Owner/Admin | locked run + snapshot |
| D-1 | Execute bank transfers; mark paid | Owner/Admin | paid run |
| D | Payslips released to employees | system | payslip PDFs |
| D+3 | Archive reports; note anomalies for next cycle | Admin | monthly close note |

- **Milestone:** three consecutive on-time cycles ⇒ client is "retained/healthy".
- **Success criteria:** cycle effort trends down month over month; zero post-approval
  corrections; payslip queries decreasing (the "explain" feature working).
- **UX improvements (human):**
  - [ ] In-app cycle checklist with due dates + reminders (this table, productized).
  - [ ] Anomaly-first review: surface only employees whose pay *changed* vs last month.
  - [ ] THR run treated as a guided seasonal variant, announced ahead of Lebaran.
- **AI-agent readiness:**
  - [ ] This entire loop is the #1 agent use case: an agent runs D-7 → D-5 steps
        (chase exceptions, validate, prepare draft, write the diff summary) and hands a
        human the D-3 approval. Design every step idempotent and resumable.
  - [ ] Scheduled-task hooks (cron-like) + webhooks for cutoff events.

## W8 — Reporting, filing & upgrade

- **Goal:** compliance artifacts filed; client converts to paid when they outgrow free.
- **Entry criteria:** ≥ 1 completed payroll run (filing); 6th employee or feature need
  (upgrade).
- **Inputs:** on upgrade — company NPWP, BPJS account numbers, legal fields (collected
  *now*, not before); payment method (Midtrans/Xendit/Stripe).
- **Activities:** generate PPh 21 / e-Bupot export + BPJS SIPP export → file externally
  → upgrade flow → seat metering → invoices.
- **Outputs:** filing-format exports; active subscription; usage-based invoices.
- **Milestone:** first successful paid invoice; first accepted e-Bupot/SIPP export.
- **Success criteria:** exports accepted by government systems without manual editing;
  free→paid conversion tracked at the seat-limit prompt; involuntary churn (failed
  payment) < 2%.
- **UX improvements (human):**
  - [ ] Upgrade prompt sells the *outcome* ("add your 6th employee + automatic tax
        exports"), priced in rupiah, local payment methods first.
  - [ ] Filing calendar with Indonesian statutory deadlines + reminders.
  - [ ] NPWP/BPJS collection as a one-time guided form with format validation.
- **AI-agent readiness:**
  - [ ] Exports retrievable via API in exact filing formats; checksums/manifests so an
        agent can verify completeness before a human files.
  - [ ] **Money guardrail:** agents never initiate payment or change billing — read
        access to invoices/metering only.

## W9 — Growth & multi-company expansion

- **Goal:** retained clients grow seats; accountants add client companies; advanced
  needs (API, SSO, loans, performance) routed to Stage 7 features.
- **Entry criteria:** W7 healthy for ≥ 3 cycles.
- **Inputs:** demand signals (feature requests, seat growth, switcher usage).
- **Activities:** add companies via switcher; per-company roles for client staff;
  adopt Stage 7 modules by demand; API/webhooks for integrators.
- **Outputs:** multi-company portfolio under one account; expansion revenue.
- **Milestone:** accountant operating ≥ 3 companies, or a company doubling seats.
- **Success criteria:** cross-company isolation never breached (pgTAP + audits);
  per-company context switching < 2s; NPS from accountant persona tracked separately.
- **UX improvements (human):**
  - [ ] Portfolio dashboard for accountants: payroll status across *all* their
        companies in one view (which clients are at D-5, who's blocked).
  - [ ] Cloneable company templates (leave policy, schedules) for fast client setup.
- **AI-agent readiness:**
  - [ ] The accountant portfolio is the killer agent surface: one agent running W7 for
        20 client companies. Requires per-company scoped tokens, rate limits, and a
        cross-company status API.

---

## 2. AI-agent readiness — cross-cutting principles

Current focus is human UX; build these in as you go so agents become a deployment
detail, not a rewrite:

1. **API parity with UI.** Anything a human can do on a screen has an endpoint
   (Stage 7 public API). No screen-only capabilities.
2. **State machines, not pages.** Every workflow (payroll run, leave request, invite)
   has explicit machine-readable states and allowed transitions.
3. **Idempotency everywhere.** All mutating endpoints accept idempotency keys; agents
   retry.
4. **Structured errors.** Error responses name the field, the rule violated, and the
   fix — the same data that powers good human error messages.
5. **Actor attribution.** Audit log distinguishes human / agent-on-behalf-of-human /
   system. Already have audit-log writes (cross-cutting rule); add an `actor_type`.
6. **Human approval gates as policy.** Payroll approval, payments, billing changes,
   and employee termination require a human credential — enforced server-side.
7. **Policy-as-data.** Tax tables already are (versioned reference tables); extend the
   pattern to leave rules, approval thresholds, and validation rules.
8. **Events out.** Webhooks/Realtime for cutoff dates, anomalies, state transitions —
   agents react to events rather than poll.
9. **Money stays integer rupiah** in every API payload (AGENTS.md rule 3) — agents
   must never receive floats they could mis-round.

---

## 3. Blank stage template (copy for new workflows)

```markdown
## Wx — <Stage name>
- **Goal:**
- **Entry criteria:**
- **Inputs:**
- **Activities:**
- **Outputs:**
- **Milestone:**
- **Success criteria:**
- **UX improvements (human):**
  - [ ]
- **AI-agent readiness:**
  - [ ]
```

## 4. Using this playbook

- **Per release:** walk the affected stage's UX checklist; close at least one item.
- **Per new client (esp. accountant-managed):** use W1–W5 as the onboarding runbook;
  measure time-to-first-payroll.
- **Quarterly:** review §2 against the API surface; promote one stage's agent-readiness
  items into the roadmap.

---

## 5. Live-code audit — 2026-06-12

Snapshot of the shipped product vs. the intended journey above. Scope: `apps/web`
(App Router) + `apps/mobile` (Expo). Legend: ✅ present · ◑ partial · ❌ missing.

| Stage | Status | What exists in code | Gaps vs. this playbook |
|---|---|---|---|
| **W1 Signup** | ◑ | Email/password signup, verify, forgot/reset (`app/(auth)/**`); 2-hour inactivity sign-out shipped (`components/idle-timeout` wired in `app/(app)/layout.tsx`). | **Google OAuth not built** — signup is password-only; callback route (`app/auth/callback/route.ts`) is generic but no `signInWithOAuth` path or provider button. W1 UX checkbox "Google OAuth up front" still open. |
| **W2 Company setup** | ◑ | `create_company_with_owner` via `app/(onboarding)/actions.ts` + `companies/new/actions.ts`; free tier, no NPWP on free path. | No post-create "next 3 steps" checklist; no machine-readable `setup_checklist` JSON (both W2 items open). |
| **W3 Workforce setup** | ✅ | Employee CRUD (`employees/**`), member invites (`members/**`, `invite/[token]`), **CSV bulk import shipped** (`employees/import` — quoted-field parser, header row), seat-limit enforced (`free_seat_limit`). | Import is CSV only (no XLSX); field-level validation rules not yet exposed as schema (agent item open). |
| **W4 Attendance** | ✅ | Web Realtime board (`attendance/live-board.tsx`); **mobile clock-in with geofence + selfie liveness** (`expo-camera`, `expo-location`, `nearestGeofence`, `livenessPhase`) incl. permission handling. | **Offline/poor-signal queueing missing** — `pendingKind` is in-flight capture state only, no AsyncStorage/retry persistence. Anomaly webhook feed (agent item) open. |
| **W5 First payroll ★** | ✅ | Full state machine `draft → queued → paid` (`payroll/actions.ts`); `config_snapshot` captured at draft; **role gate** (owner/admin) on approve/mark-paid; idempotent approve; per-employee breakdown page (`payroll/[runId]`) with per-line BPJS rows, **TER category + rate shown**, and **side-by-side diff vs. prior run** (`totalsDiff`); Cloud Run worker generates payslips. | Approval gate is role-based, **not** human-vs-agent credential — `actor_type` distinction (§2.5) not yet encoded. No plain-language "Explain this number" tooltip — numbers are labeled but not explained (no popover/formula UI). |
| **W6 Self-service** | ✅ | Leave + claims on web (`leave/**`, `claims/**`) and mobile (`(app)/leave.tsx`, `claims.tsx`). | Policy-as-data, receipt OCR hook, delegated-approval API (agent items) open. |
| **W7 Steady-state loop** | ❌ (process) | No productized in-app cycle checklist found; the D-7…D+3 table is still doc-only. | Biggest agent surface (§W7) unbuilt: no scheduled-task/cron hooks for cutoff events. |
| **W8 Reporting & upgrade** | ✅ | Reports export **e-Bupot / SIPP / PPh21 → XLSX** (`reports/actions.ts`); billing upgrade flow (`billing/**` — plan cards, upgrade form). | **Filing calendar with statutory deadlines missing** (no match in reports/settings). Export manifest/checksum (agent verify) open. |
| **W9 Growth & API** | ◑ | Company switcher (`companies/**`); **developer API shipped** — API keys (`developer/key-form`, `secret-reveal`) + **webhooks with event subscriptions** (`WEBHOOK_EVENTS`). | Accountant **portfolio dashboard** (cross-company status view) not found; per-company scoped tokens / rate limits unverified. |

**Headline gaps to feed the roadmap:**
1. **Google OAuth** (W1) — listed as a friction-killer, still password-only.
2. **Onboarding checklist** (W2) — empty dashboard after company create; no `setup_checklist`.
3. **Steady-state automation** (W7) — the highest-value agent loop has no cron/webhook scheduling yet.
4. **`actor_type` attribution** (§2.5 / W5) — payroll gate is role-based; human-vs-agent distinction not encoded, blocking the W5 hard-gate and clean agent audit trails.
5. **Accountant portfolio view** (W9) — the "killer agent surface" has no cross-company dashboard.

> Method: route/grep audit only; not a behavioral test pass. Re-run before each
> quarterly review (§4) and bump the date.
