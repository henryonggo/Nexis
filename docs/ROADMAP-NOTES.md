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
| WhatsApp notifications | ❌ | ❌ | extend `send-notification` |
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

### 2. WhatsApp notifications (smallest next win)
Extend the existing `supabase/functions/send-notification` path (already does Expo
push + email) with a WhatsApp channel (Meta Cloud API). App side is minimal — a
per-user/company opt-in + phone capture. Good candidate for a quick handoff.

### 3. Recruitment / ATS, Multi-currency, SSO/SCIM, Mobile offline
Larger greenfield tracks; prioritize by market feedback per `docs/04-roadmap.md`
Stage 7. None started. Each needs a fresh handoff doc + schema design.

## Cross-cutting cleanups / known debt

- **Next.js build trace bug (Windows):** `pnpm --filter @nexis/web build` fails at the
  very end with `ENOENT … _not-found/page.js.nft.json` during build-trace collection.
  Compilation + typecheck + static generation all succeed; this is an environment
  quirk, not a code error. CI (Linux) is unaffected.
- **Happy-path e2e:** every feature has an auth-guard Playwright spec that runs
  unattended; the seeded happy-path tests are gated behind `E2E_STORAGE_STATE`
  (a signed-in session). Stand that up to exercise approve/submit/generate flows.
- **i18n:** app pages currently use hardcoded id-ID strings (the dominant pattern in
  the codebase). If/when en parity is required, lift strings into `messages/*.json`.

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
| 3 | No account deactivation | ✅ `/settings` page + `deactivateAccount` action | `profiles.deactivated_at` + RPC `deactivate_current_user()` + login guard |
| 4 | No "add company" (multi-company) | ✅ switcher entry + `/companies/new` (reuses `create_company_with_owner`) | — |
| 5 | No user documentation | ✅ `docs/user-guide.md` (screenshots TODO once UI matures) | — |
| 6 | Confirmation email from Supabase, link → localhost | ✅ branded Resend verify email via admin `generateLink`, redirect → `/sign-in` | **Site URL** → prod + add to redirect allowlist (fixes the localhost link); keep "Confirm email" ON; Vercel env `SUPABASE_SERVICE_ROLE_KEY`/`RESEND_API_KEY`/`EMAIL_FROM`/`NEXT_PUBLIC_SITE_URL`. NB: `generateLink` does **not** auto-send, so no Supabase email to disable. |
| 7 | Auto sign-out after inactivity | ✅ `idle-timeout.tsx` (2h) → `/sign-in?timeout=1` | Review **Auth → Sessions** lifetime / refresh-token rotation to match client policy |
| 8 | No show/hide password toggle | ✅ `password-input.tsx` on all auth forms | — |

## Working agreement reminder (the DB seam)
Claude owns app layer (`apps/**`, `packages/ui|money|payroll|leave`, i18n, e2e);
Antigravity owns everything behind the Supabase client (`supabase/**`, `services/**`,
and regenerates `packages/types`). When a feature needs new data, build the app
against the agreed shape behind a single quarantine cast and file a
`docs/handoff/<feature>.md` `TODO(db)` — never edit across the seam. See
`docs/08-agent-boundaries.md`.
