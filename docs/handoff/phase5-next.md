# Phase 5 — Net-new features: technical specs (to do next)

> Planning + technical spec for the remaining Stage-7 tracks. Written by Claude Code
> (app lane). Each track keeps the **DB-seam split** (`docs/08-agent-boundaries.md`):
> **Antigravity** owns `supabase/**`, `services/**`, `infra/**`, and regenerates
> `packages/types`; **Claude** owns `apps/**`, `packages/ui|money|payroll|leave`, i18n, e2e.
> Cross-seam needs go via `TODO(db)` / `TODO(infra)` + a per-feature handoff doc.
>
> **Already started / handed off (not repeated here):**
> - WhatsApp notifications → `docs/handoff/whatsapp-notifications.md` (app opt-in shipped).
> - Billing payment gateway → `docs/handoff/stage-06-billing-gateway.md`.
>
> **Conventions for every track below:** RLS ON + pgTAP for new tenant tables; money is
> integer rupiah (`bigint`); all user-facing strings via `next-intl` (`messages/{id,en}.json`);
> audit-log writes for sensitive actions; `timestamptz` (UTC) stored, WIB presented;
> regenerate `packages/types` after migrations. Acceptance = the criteria listed per track.

Suggested order (value × effort): **1) Recruitment/ATS → 2) Multi-currency/expat →
3) SSO/SCIM → 4) Mobile offline.** Each is independent; do one at a time, gated on its own
acceptance criteria.

---

## 1. Recruitment / ATS

**Goal:** track job openings → applicants → interview stages → hire, and convert a hired
applicant into an `employees` row (feeding existing onboarding/payroll).

### Data model — TODO(db) (Antigravity)
- `job_openings` — `id`, `company_id` (FK), `title`, `department`, `employment_type`
  (reuse `employment_type` enum), `description`, `status` enum
  `job_opening_status` (`open|paused|closed|filled`), `created_by`, timestamps.
- `candidates` — `id`, `company_id`, `full_name`, `email`, `phone`, `resume_path`
  (Storage), `source` (text), timestamps. (Company-scoped; a person may reapply.)
- `applications` — `id`, `company_id`, `job_opening_id` (FK), `candidate_id` (FK),
  `stage` enum `application_stage` (`applied|screening|interview|offer|hired|rejected`),
  `rating` (smallint, nullable), `notes`, `rejected_reason`, timestamps. Unique
  `(job_opening_id, candidate_id)`.
- `interviews` (optional v1.1) — `id`, `company_id`, `application_id` (FK),
  `scheduled_at timestamptz`, `interviewer_id`, `mode` (`onsite|video|phone`), `feedback`,
  `outcome` enum (`pending|pass|fail`).
- **RLS:** all tenant-scoped; read = any member of the company; write = owner/admin/manager
  (recruiters). Candidate `resume_path` in a private Storage bucket with company-scoped
  access (mirror the leave-attachment / receipt pattern).
- **RPC:** `hire_application(application_id)` `security definer` — sets stage `hired`, marks
  the opening `filled` (if 1 hire) and inserts a draft `employees` row
  (`status='probation'`, copy name/email/phone/employment_type), returning the new
  `employee_id`. Keeps the app from cross-writing employees during the transition.
- Storage bucket `resumes` (private) + signed-URL read for recruiters.

### App layer (Claude)
- `/recruitment` (list openings + counts per stage), `/recruitment/[openingId]` (kanban or
  per-stage lists of applications; drag/stage-advance via server actions), candidate detail
  panel with résumé link, rating, notes.
- `/recruitment/new` (create opening). Public/extlink apply form is **out of scope v1**
  (admins add candidates manually or via résumé upload).
- Server actions: create opening, add candidate (+ résumé upload to `resumes`), advance
  stage, reject, **hire** (calls `hire_application` RPC → redirect to the new employee).
- Reuse `ExportCsvButton`, status badges (new `application_stage` badge), skeletons,
  `loading.tsx`. i18n namespace `recruitment.*`. e2e: auth-guard + happy-path
  (create opening → add candidate → advance → hire), gated by `E2E_STORAGE_STATE`.

### Acceptance
Admin creates an opening, adds a candidate with résumé, advances through stages, hires →
a probation `employees` row appears and is editable in `/employees`; RLS verified
(cross-company isolation); résumé only readable by the owning company.

---

## 2. Multi-currency / expat

**Goal:** support employees paid in a non-IDR currency (expats), while keeping IDR the
system base for tax/BPJS (which remain IDR by law).

### Data model — TODO(db) (Antigravity)
- `currencies` reference (`code` ISO-4217, `symbol`, `decimals`) — seed common ones.
- `exchange_rates` — `id`, `base='IDR'`, `quote` (FK code), `rate` (numeric, units of quote
  per IDR or vice-versa — **pick one and document**), `effective_from`, `source`. Versioned
  like `tax_brackets` (rates are data, not constants).
- `compensation`: add `currency` (default `'IDR'`) + keep `base_salary` in **minor units of
  that currency** (still integer). **Decision:** payroll converts comp → IDR at run time
  using the snapshotted rate, then computes BPJS/PPh21 in IDR (compliance stays IDR).
- Snapshot the FX rate into `payroll_runs.config_snapshot` for reproducibility (same pattern
  as tax config).
- **RLS:** `currencies`/`exchange_rates` readable by all authed; writable service-role only.

### Engine — `packages/payroll` (Claude) + worker (Antigravity)
- Add an FX step: convert `base_salary(currency)` → IDR using the run's snapshot rate before
  the existing gross/BPJS/PPh21 math. Net pay presented in **both** the pay currency and IDR.
- Exhaustive unit tests with fixtures (IDR passthrough = identity; a non-IDR case to the
  rupiah). Money stays integer; rounding rule documented (round at conversion boundary).

### App layer (Claude)
- Employee comp form: currency selector + amount in that currency.
- Payslip / run review: show pay-currency amount + IDR equivalent + the rate used.
- `money` package: extend formatter to format non-IDR (symbol, decimals) — keep IDR path
  unchanged. i18n `currency.*`.

### Acceptance
An expat on USD comp runs through monthly payroll: gross shown in USD + IDR; BPJS/PPh21
computed in IDR off the converted gross; re-running after a rate change does **not** alter a
historical run (snapshot holds); IDR-only employees are byte-for-byte unchanged.

---

## 3. SSO / SCIM (enterprise)

**Goal:** enterprise tenants sign in via their IdP (SAML/OIDC) and auto-provision members
via SCIM. Maps to the Enterprise plan.

### Mostly infra / DB — TODO(db) + TODO(infra) (Antigravity)
- Use **Supabase Auth SSO** (SAML 2.0) — configure IdP per domain; map email domain →
  company. Keep email/password for non-enterprise.
- `company_sso` — `company_id`, `provider` (`saml|oidc`), `idp_metadata`/`domain`, `enabled`,
  `default_role` for JIT-provisioned users. Service-role managed.
- **SCIM bridge** (Cloud Run service or Edge fn) exposing `/scim/v2/Users` + `/Groups` with
  a per-company bearer token; creates/updates/deactivates `company_members` + `profiles`.
  Reuse `profiles.deactivated_at` for SCIM deprovision. Token stored hashed (mirror the
  developer API-key pattern).
- RLS: only owner can view/manage their company's SSO config.

### App layer (Claude — thin)
- `/settings/sso` (owner-only): show SSO status, domain, SCIM base URL + a one-time SCIM
  token (reuse `SecretReveal`), enable/disable (calls service via Edge fn — never writes
  `company_sso` directly). i18n `sso.*`.
- Sign-in page: "Sign in with SSO" → email-domain lookup → Supabase SSO redirect.

### Acceptance
A test enterprise company links an IdP; a user from its domain signs in via SSO and lands
as a member with `default_role`; SCIM create/deactivate reflects in `/members`; non-SSO
companies unaffected.

### Risks
Needs a real IdP (Okta/Azure AD) to validate; SAML config is fiddly. Spike Supabase SSO
limits before committing. Largest of the four; clearly enterprise-gated.

---

## 4. Mobile offline mode

**Goal:** the Expo app keeps working with no/poor connectivity for the field-critical flows:
**clock in/out** (Stage 3) and viewing the latest payslip.

### App layer — `apps/mobile` (Claude)
- Local queue (SQLite via `expo-sqlite` or WatermelonDB) for attendance events created
  offline: store `{client_uuid, kind, event_at, lat/lng, selfie_local_uri, synced}`.
- Background/foreground **sync** when connectivity returns (`expo-network` +
  `expo-task-manager`): upload selfies to Storage, then insert `attendance_records` with the
  `client_uuid` for idempotency. Show per-row sync state in the UI.
- Cache the latest payslip PDF + profile locally (`expo-file-system`) for offline view.
- Conflict policy: attendance is append-only → no merge conflicts; rely on idempotent insert.

### TODO(db) (Antigravity — small)
- `attendance_records`: add nullable `client_uuid uuid` + **unique** `(company_id, client_uuid)`
  so retried offline uploads dedupe. RLS unchanged (employee self-insert already exists).

### Acceptance
In airplane mode an employee clocks in/out; events queue locally with a "pending sync"
badge; on reconnect they upload exactly once (no duplicates on retry) and appear on the web
live board; latest payslip is viewable offline.

### Risks
Selfie upload + geofence offline edge cases; liveness capture must work without network.
Device testing required (iOS + Android).

---

## Tracking
As each track starts, spin its own `docs/handoff/<feature>.md` (mirror the loans/performance/
whatsapp handoffs), list the stage's `TODO(db)`/`TODO(infra)` there, and update the Stage-7
table in `docs/ROADMAP-NOTES.md`. Do not begin a track's app build against unagreed shapes —
agree the schema in the handoff first, then build behind a single quarantine cast.
