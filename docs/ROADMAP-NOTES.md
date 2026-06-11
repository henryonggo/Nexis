# Roadmap Notes — Future Development

> Living scratch/handoff note maintained by Claude Code (app-layer lane). Captures
> what's shipped and what's open so any agent (or human) can pick up cold.
> **Not authoritative** — `AGENTS.md` + `docs/04-roadmap.md` + the per-stage specs win.
> Safe to prune as items land. Last updated: 2026-06-05.

## Where things stand

Stages 1–6 are complete (DB + app, web + mobile) and on `dev` → `main`. Stage 7
(advanced/optional) is well underway. Both the schema (Antigravity) and the app
layer (Claude) are landed for the items marked ✅.

| Stage 7 track | Schema (Antigravity) | App layer (Claude) | Notes |
|---|---|---|---|
| Analytics dashboard | ✅ | ✅ | `/analytics` |
| Audit & compliance center | ✅ | ✅ | `/audit` |
| CSV exports | ✅ | ✅ | employees / payroll / audit lists |
| Reporting & exports (Stage 6) | ✅ | ✅ | `/reports` + Cloud Run report worker |
| Loans & advances (kasbon) | ✅ | ✅ | `/loans`; deduction in payroll worker |
| Performance & KPI | ✅ | ✅ | `/performance`; mobile self-service |
| Public API & webhooks | ✅ | ✅ | `/developer`; `public-api` + `dispatch-webhook` Edge fns |
| **Billing payment gateway** | ⚠️ partial | ⚠️ sandbox | see Open Item #1 |
| Recruitment / ATS | ❌ | ❌ | not started |
| Multi-currency / expat | ❌ | ❌ | not started |
| SSO / SCIM (enterprise) | ❌ | ❌ | not started |
| WhatsApp notifications | ❌ pending | ⚠️ opt-in done | app opt-in shipped (Phase 5); needs `profiles.whatsapp_opt_in` + WA channel — `docs/handoff/whatsapp-notifications.md` |
| Mobile offline mode | ❌ | ❌ | not started |

## Open items (prioritized)

### 1. Billing payment gateway — the biggest open thread
**State:** `/billing` exists and works as a **sandbox plan-flip** — `upgradePlan`
in `apps/web/app/(app)/billing/actions.ts` directly sets `company_billing.plan`
(+ `companies.plan`) and captures NPWP/BPJS. Marked `TODO(infra)` there.

**What's missing (mostly Antigravity / infra lane):**
- Real gateway checkout — **Midtrans/Xendit** (ID cards, VA, e-wallet, QRIS) and/or
  Stripe (international). An Edge Function or Cloud Run service to create a
  checkout/charge session.
- **Payment-success webhook** (service role) that writes `subscriptions` + `invoices`
  rows and flips `company_billing.plan`. Those tables are service-role-only by RLS,
  so the app cannot populate them — this must live behind the DB client.
- Subscription lifecycle: plan change, cancellation, past_due handling, invoice PDFs.

**Claude's app-layer part (once the gateway exists):**
- Replace the direct flip with: POST to create a checkout session → redirect to the
  gateway → handle the return URL (pending/active states).
- Show live subscription status + invoice history (the read side, `lib/billing.ts`,
  already lists `subscriptions`/`invoices`).
- Acceptance: `docs/stages/stage-06-reporting-billing.md` #1, #4.

Write a `docs/handoff/stage-06-billing-gateway.md` (mirror the loans/performance
handoff docs) before starting, agreeing the Edge Function request/response shape.

### 2. WhatsApp notifications — ⚠️ app opt-in shipped (Phase 5, see below)
App-side opt-in + phone capture is done on `/settings`. Remaining is infra:
`profiles.whatsapp_opt_in` column + the Meta Cloud API channel in
`supabase/functions/send-notification`. Full contract: `docs/handoff/whatsapp-notifications.md`.

### 3. Recruitment / ATS, Multi-currency, SSO/SCIM, Mobile offline
Larger greenfield tracks; prioritize by market feedback per `docs/04-roadmap.md`
Stage 7. None started. Each needs a fresh handoff doc + schema design.

## Cross-cutting cleanups / known debt

- **Next.js build trace bug (Windows):** `pnpm --filter @nexis/web build` fails at the
  very end with `ENOENT … _not-found/page.js.nft.json` during build-trace collection.
  Compilation + typecheck + static generation all succeed; this is an environment
  quirk, not a code error. CI (Linux) is unaffected.
- **Happy-path e2e:** ✅ stood up in Phase 4 (below). Auth session is now produced by
  `e2e/auth.setup.ts` from `E2E_EMAIL`/`E2E_PASSWORD`; happy-path specs gate on
  `e2e/_auth.ts` (`HAS_AUTH`). Still needs **seeded fixtures** (pending leave/claims, etc.)
  in the target DB to exercise the data-dependent branches — seeding is Antigravity's lane.
- **i18n:** ✅ done in Phase 3 — app/auth pages migrated to `next-intl` (`messages/{id,en}.json`).
  Tail items (landing page, server-action strings, CSV headers) listed in the Phase 3 note.

## How to run things on this machine (Windows)
Node + pnpm are not on the default PATH. Prepend in each new shell:
```powershell
$env:Path = "C:\Program Files\nodejs;C:\Users\henry\AppData\Roaming\npm;" + $env:Path
```
- `pnpm -r typecheck` — whole monorepo (8 projects).
- `pnpm --filter @nexis/web typecheck` / `... build`; `pnpm --filter @nexis/mobile typecheck`.
- Engine tests: `pnpm --filter @nexis/payroll test`, `pnpm --filter @nexis/leave test`.
- Web e2e: `pnpm --filter @nexis/web exec playwright test` (needs `apps/web/.env.local`).

## Post-launch bug fixes (nexishr.vercel.app prototype) — 2026-06-08

Reported against the live prototype; app-layer work owned by Claude, cross-seam items
flagged for Antigravity / human dashboard config.

| # | Issue | App layer (Claude) | Handoff (Antigravity / human) |
|---|---|---|---|
| 1 | `/leave` (Cuti) & `/claims` (Klaim) throw; back button broken | ✅ `error.tsx` boundary + `global-error.tsx`; **root cause fixed**: ambiguous `employees` embed (two FKs: `employee_id` + `decided_by`) → explicit FK hint in `lib/leave.ts` + `lib/claims.ts` | none (resolved in-lane) |
| 2 | Mobile Sign-out hidden; English auth wording | ✅ responsive header/nav; `Keluar`→`Sign out`; auth screens → English | — |
| 3 | No account deactivation | ✅ `/settings` page + `deactivateAccount` action (uses typed RPC) | ✅ done — `profiles.deactivated_at` + RPC `deactivate_current_user()` + guards landed by Antigravity (`20260608123700`) |
| 4 | No "add company" (multi-company) | ✅ switcher entry + `/companies/new` (reuses `create_company_with_owner`) | — |
| 5 | No user documentation | ✅ `docs/user-guide.md` (screenshots TODO once UI matures) | — |
| 6 | Confirmation email from Supabase, link → localhost | ✅ branded Resend verify email via admin `generateLink`, redirect → `/sign-in` | **Site URL** → prod + add to redirect allowlist (fixes the localhost link); keep "Confirm email" ON; Vercel env `SUPABASE_SERVICE_ROLE_KEY`/`RESEND_API_KEY`/`EMAIL_FROM`/`NEXT_PUBLIC_SITE_URL`. NB: `generateLink` does **not** auto-send, so no Supabase email to disable. |
| 7 | Auto sign-out after inactivity | ✅ `idle-timeout.tsx` (2h) → `/sign-in?timeout=1` | Review **Auth → Sessions** lifetime / refresh-token rotation to match client policy |
| 8 | No show/hide password toggle | ✅ `password-input.tsx` on all auth forms | — |

## UX & reliability hardening — Phase 1 (2026-06-09)

App-layer polish pass on the live prototype (Claude lane). Plan is phased; this is
Phase 1 of 5 (next: billing UX + gateway handoff → i18n/next-intl → happy-path e2e →
net-new features e.g. WhatsApp opt-in).

| Item | State |
|---|---|
| Loading skeletons | ✅ `components/skeleton.tsx` (reusable primitives) + `loading.tsx` on **all 21** `(app)` routes. Design-system req (`06`, "loading/skeletons") — previously zero. |
| Global 404 | ✅ `app/not-found.tsx` (verified HTTP 404 + branded copy). |
| Live dashboard KPI | ✅ "Kehadiran hari ini" now shows real present-today count (latest event per employee, WIB day boundary) instead of static "Langsung" placeholder. |

Remaining Phase 1 candidates (not yet done, lower marginal value): per-section error
boundaries (one global `(app)/error.tsx` already covers all routes), shadcn/ui
consolidation of hand-rolled cards/tables, mobile table overflow polish. Defer unless
prioritized — would balloon the diff against "surgical changes."

Verify: `pnpm --filter @nexis/web typecheck` passes.

## Billing UX & gateway handoff — Phase 2 (2026-06-09)

App-layer billing polish + unblocking the real payment path.

| Item | State |
|---|---|
| Plan-comparison UI | ✅ `billing/plan-cards.tsx` — selectable radio-card grid (Gratis/Starter/Growth/Enterprise) with feature bullets, per-seat price, current-plan badge. Replaces the bare `<select>` in `upgrade-form.tsx`. Feature bullets added to `lib/billing-plans.ts`. |
| Gateway handoff | ✅ `docs/handoff/stage-06-billing-gateway.md` — pins the `create-billing-checkout` + `billing-webhook` Edge-fn contract, the `subscriptions`/`invoices` writes, and the app-side follow-up. `TODO(infra)` in `billing/actions.ts` now points to it. |

Still blocked on infra (Antigravity + a gateway account): real checkout, webhook,
subscription status display, return-URL pending state. App read side (`lib/billing.ts`)
and the plan/invoice UI are ready for it. Existing `scratch/test_billing_webhook.js`
prototype should be folded into the webhook work.

Verify: `pnpm --filter @nexis/web typecheck` passes.

## i18n (next-intl) migration — Phase 3 (2026-06-09, ✅ all app+auth pages done)

Wired real i18n and began migrating hardcoded id-ID strings into `messages/{id,en}.json`
(AGENTS.md rule 7). **Cookie-based, no URL routing** — route groups untouched.

**Infrastructure (done, verified):**
- `next-intl@3.26.5` added to `apps/web`.
- `i18n/config.ts` (client-safe locale constants), `i18n/locale.ts` (`getUserLocale`,
  reads `NEXIS_LOCALE` cookie), `i18n/actions.ts` (`setUserLocale`), `i18n/request.ts`
  (getRequestConfig). Plugin wired in `next.config.mjs`. Root layout wraps children in
  `NextIntlClientProvider` + sets `<html lang>` from the locale.
- `components/locale-switcher.tsx` in the app top bar (ID/EN).
- **Verified live:** `NEXIS_LOCALE=en` → `<html lang="en">` + English sign-in;
  `=id` → Indonesian. Server + client components both translate.

**Migrated (done):** app shell layout (nav + sign-out), auth layout + sign-in/sign-up/
forgot/reset, onboarding page + form, dashboard, `not-found.tsx`, `(app)/error.tsx`,
shared components (`submit-button`, `export-csv-button`, payroll `status-badge`,
`company-switcher`), employees list, payroll list, **attendance (page + live-board),
leave (page + status-badge + decision-buttons), claims (page + status-badge +
decision-buttons), loans (page + status-badge + decision-buttons + request-form),
billing (page + upgrade-form + plan-cards + localized plan descriptions/features via
`planDetails` namespace), members (page + invite-form), settings (page +
deactivate-section), companies/new (form), reports (page + report-form + status-badge +
localized report types), analytics (page + charts via props), audit (page + localized
action/entity labels)**. Shared `decision` namespace reused across leave/claims/loans.
`plans` namespace localizes plan names everywhere. Typecheck passes after every batch.

Also migrated: **developer (page + key-form + webhook-form + row-actions + secret-reveal),
employees new/[id]/import (pages + forms, incl. employmentType/status enums), payroll
new (+ form) + run-detail `[runId]` (+ actions-bar, status-stream, summary/breakdown +
WIB month names), invite/[token] (+ accept), performance (page + cycle-form + goal-form +
goal-progress + review-form + status badges)**.

**✅ Every `(app)`, `(auth)`, `(onboarding)`, and invite page is now bilingual.**
Verified live: id ↔ en toggles `<html lang>` + all copy across auth pages + 404, no
`MISSING_MESSAGE`. Full `pnpm --filter @nexis/web typecheck` passes.

**Remaining tail (intentionally deferred — app is fully functional; these are
non-screen artifacts or a separate surface):**
- **Landing/marketing page** (`app/_landing/**`) — public marketing site, separate from
  the app; still id-only (e.g. `pricing.tsx`). Migrate if a localized marketing site is wanted.
- **Server-action** error/success strings (`actions.ts` return literal strings shown via
  `state.error`/`state.success`) — migrate via `getTranslations` in the action, or return keys.
- **CSV export column headers** — download artifact, not on-screen; left id.
- `global-error.tsx` — renders outside the provider; left as-is.
- Now app-unused id label maps in lib (`reportTypeLabel`, audit `actionLabel`/`entityLabel`,
  `billing-plans` description/features) — safe to prune later.

Pattern to copy: server components → `const t = await getTranslations("ns")`; client
components → `const t = useTranslations("ns")`. Add keys to **both** `messages/*.json`.

## e2e safety net — Phase 4 (2026-06-09)

Stood up the signed-in Playwright session so the happy-path specs actually run, and
deepened them into money-flow assertions.

| Item | State |
|---|---|
| Auth session | ✅ `e2e/auth.setup.ts` — a Playwright **setup project** signs in a seeded admin from `E2E_EMAIL`/`E2E_PASSWORD` (locale-independent selectors) and writes `playwright/.auth/admin.json`. Skips cleanly when creds are absent. |
| Gating helper | ✅ `e2e/_auth.ts` (`STORAGE_STATE`, `HAS_AUTH`); all 9 happy-path specs now resolve auth through it (run when creds/file present, else skip). |
| Config | ✅ `playwright.config.ts` — `setup` project + `chromium` `dependencies: ["setup"]`. |
| Money flows | ✅ payroll happy-path now **creates a draft run and approves it** (asserts draft→queued + approve control disappears); leave spec **approves a pending request when seeded** (else asserts empty state — robust without fixtures). |
| Secrets | ✅ `playwright/.auth/` gitignored. |

**How to run the full authed suite:** seed an admin (Antigravity), then
`E2E_EMAIL=… E2E_PASSWORD=… pnpm --filter @nexis/web exec playwright test`.

Verified: `playwright test --list` collects 25 tests / 10 files (setup + chromium);
all 12 **auth-guard** tests pass against a dev server (`E2E_BASE_URL=…`), setup +
happy-path skip gracefully with no creds. (Full prod-build run blocked locally only by
the Windows build-trace bug above; unaffected in CI/Linux. Parallel dev runs can
cold-compile-timeout — run `--workers=1` against a dev server, or a prebuilt server.)

## Net-new features — Phase 5 (2026-06-09, in progress)

Starting the optional Stage-7 feature track with the smallest high-value win.

| Item | State |
|---|---|
| WhatsApp opt-in (app side) | ✅ `/settings` → **Notifications**: phone capture (`profiles.phone`, real) + WhatsApp opt-in toggle (`profiles.whatsapp_opt_in`, quarantined). `updateNotifications` action validates phone (8–15 digits, required when opting in). Fully i18n'd (`settings.notifications.*`). |
| Handoff | ✅ `docs/handoff/whatsapp-notifications.md` — `TODO(db)` (column + self-update RLS) + `TODO(infra)` (Meta Cloud API channel + templates in `send-notification`). |

Blocked on infra (Antigravity + Meta account): the `whatsapp_opt_in` column, self-update
RLS, and the WA send channel. App opt-in degrades gracefully until then (phone saves;
opt-in writes the pending column behind the cast). Verify: `pnpm --filter @nexis/web typecheck` passes.

Next Phase-5 candidates (larger, each needs its own handoff + schema) are fully spec'd in
**`docs/handoff/phase5-next.md`** — recruitment/ATS, multi-currency/expat, SSO/SCIM, mobile
offline, with the DB-seam split, data models (`TODO(db)`), app scope, and acceptance per track.

## Working agreement reminder (the DB seam)
Claude owns app layer (`apps/**`, `packages/ui|money|payroll|leave`, i18n, e2e);
Antigravity owns everything behind the Supabase client (`supabase/**`, `services/**`,
and regenerates `packages/types`). When a feature needs new data, build the app
against the agreed shape behind a single quarantine cast and file a
`docs/handoff/<feature>.md` `TODO(db)` — never edit across the seam. See
`docs/08-agent-boundaries.md`.
