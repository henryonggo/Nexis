# Continue here — Claude Code working notes

_Last updated: 2026-06-04. This is Claude Code's scratch/handoff note (app-layer
lane). Not authoritative — `AGENTS.md` + `docs/` win. Safe to delete anytime._

## ▶️ NOW: Stage 5 — Leave & Claims (branch `claude/stage-05-leave-claims`)
Stage 4 fully merged to `dev` (PR #4) + `main`. Started Stage 5 app layer.
- **✅ `@nexis/leave`** pure engine done — accrual (monthly/annual-lump, prorated,
  min-service gate), carry-over cap, working-day counting (weekends + holidays +
  half-day), balance + request validation. **20 tests pass, typecheck green.**
- **✅ Antigravity database & worker items landed on dev**: Stage 5 tables, RLS policies, RPCs, private storage buckets, and realtime publications are active. Types regenerated. The payroll worker now integrates approved claims, and the `send-notification` Edge function is ready.
- **Next steps for Claude (types are live):** mobile leave/claim submit + history; web approval
  dashboard + team calendar; balance views; notifications integration.

## Where things stand

### ✅ Stage 3 — Attendance (app layer) — DONE, merged to `dev`
- Merged via PR #1 (`claude/stage-03-attendance`).
- Web live dashboard (`/attendance`, Supabase Realtime), admin correction action,
  mobile clock-in (GPS geofence + selfie), i18n, Playwright (auth-guard test ran green).
- **Open handoff (Antigravity / DB):** confirm private Storage bucket
  `attendance-selfies` + insert policy. Marker: `TODO(db)` in
  `apps/mobile/lib/attendance.ts`. Until then mobile selfie upload won't work end-to-end.

### ✅ Stage 4 — Payroll ENGINE only (`packages/payroll`) — DONE, on `dev`
Pure, framework-free, integer-rupiah, rates injected as config (never hardcoded):
- Monthly TER path (pre-existing) + **new:** overtime pay (weekday 1.5×/2×,
  rest-day/holiday 2×/3×/4×), `ptkpCategory` + `buildTerLookup`, December
  reconciliation (`progressiveTax` + `computeDecemberReconciliation`), `computeThr`.
- `src/fixtures.ts` = **representative test rates only** (NOT authoritative — see header).
- `src/payroll.test.ts` = 16 hand-verified cases. **21 tests pass**, typecheck green.
- Fixed a latent tsconfig bug: `packages/payroll/tsconfig.json` now typecheck-only
  (`noEmit`/`declaration:false`) so the cross-package `@nexis/money` import resolves.
  `packages/money/tsconfig.json` has the same latent issue — fix before it imports anything.

## ▶️ Pick up here (Stage 4, rest of it)

**DB seam UNBLOCKED (2026-06-04):** Antigravity landed the Stage 4 migration +
regenerated `packages/types` (currently uncommitted in the working tree, their
lane). All reference + run tables now exist in `packages/types`:
`ter_rates`, `tax_brackets`, `ptkp_rates`, `bpjs_config`, `payroll_runs`,
`payroll_items`, `payslips`. `pay_period_status` enum = draft|queued|processing|
completed|failed|paid|cancelled. Seed rows are in `supabase/seed.sql`.
- Still pending Antigravity: Cloud Run `services/payroll-worker` (does not exist yet).

**✅ DONE (2026-06-04): item 1 — config loader.** `packages/payroll/src/config.ts`
maps reference-table rows → engine config (pure, no Supabase client; caller fetches
effective-dated rows): `buildPayrollConfig(bpjsRows, terRows)`,
`buildAnnualTaxConfig(ptkpRows, bracketRows)`, `toTerRateRows`,
`toProgressiveBrackets`. Re-exported from `index.ts`. `config.test.ts` mirrors the
seed rows verbatim (seed↔engine contract) — **34 tests pass, typecheck green**.
Biaya jabatan (5% / 6,000,000) is a statutory method default (not seeded), overridable.

**✅ DONE (2026-06-04): item 2 — web payroll UI.**
- `apps/web/lib/payroll.ts` — server compute bridge: `loadPayrollConfig`
  (effective-dated reference rows → engine config) + `computeRunPreview`
  (synchronous "dry run" used by the review screen; reused-able by the worker).
  Client-safe formatters split into `apps/web/lib/payroll-format.ts` (server-only
  import was leaking into a client component — don't merge them back).
- `app/(app)/payroll/` — list `page.tsx`, `status-badge.tsx`, `new/` wizard
  (`form.tsx` client + `page.tsx`), `[runId]/` review (`page.tsx` +
  `actions-bar.tsx` client), `actions.ts` (createDraftRun / approveRun /
  markRunPaid / cancelRun, role-gated + RLS).
- Nav entry + `/payroll` middleware guard; i18n `payroll.*` in id.json + en.json.
- e2e `e2e/payroll.spec.ts` (guards pass; happy path needs E2E_STORAGE_STATE).
- typecheck + build green; payroll engine 34 tests pass.
- Added `@nexis/payroll` to `apps/web/package.json` deps (was only in tsconfig
  paths / transpilePackages).

**Lifecycle wired:** approve sets `status='queued'` and writes NOTHING to
`payroll_items` — the worker is the sole writer. Mark-paid only from `completed`
(unreachable until the worker advances a run there). Review shows a live estimate
until the run is persisted, then reads `payroll_items`.

**✅ DONE (2026-06-04): worker integration (Antigravity landed worker + DB on dev).**
Local `dev` is ahead of origin by Antigravity's commits (worker, migration+types,
`minimum_wages` + `company_settings.region`, `attendance-selfies` bucket).
- `apps/web/lib/payroll-worker.ts` `enqueuePayrollRun` → POST worker `/process`;
  wired into `approveRun` (rolls back to draft if worker unreachable).
- `createDraftRun` now stores `runType` in `config_snapshot` (worker infers THR
  from it; no `run_type` column). Review page reads it back.
- UMR warning implemented (resolved the `minimum_wages` TODO) in `lib/payroll.ts`.
- Realtime: `payroll/[runId]/status-stream.tsx` subscribes to `payroll_runs`.
- Mobile: `apps/mobile/lib/payslips.ts` + `app/(app)/payslips.tsx` tab (signed-URL).
- Verified e2e + a worker pipeline smoke test (approve→completed→payslip PDF→signed
  URL). typecheck/build/e2e green. Happy-path e2e is slow (~20s, real server action
  + DB) — run `--workers=1` locally to avoid contention flakes.

**Still on Antigravity (see stage-04 doc "Remaining Antigravity items"):**
- `TODO(db)`: add `payroll_runs` (and likely `attendance_records`) to the
  `supabase_realtime` publication — no migration does this yet, so live status
  events don't fire (badge degrades to manual refresh).

**Env for worker integration:** `PAYROLL_WORKER_URL` (default http://localhost:3001).
Run worker: `pnpm --filter @nexis/payroll-worker dev`.

**Verify vs `docs/stages/stage-04-payroll.md` acceptance:** #1 ✅ (engine), #3 ✅
(breakdown UI), #5 ✅ (config_snapshot persisted on draft), #6 partial (UI guard +
relies on DB unique constraint), #7 ✅ (THR proration). #2/#4/#8 need the worker +
Storage (Antigravity).

## Environment / how to run things on this machine

Node + pnpm were installed mid-session and are **not on the default PATH**. Prepend
this in each new shell (PowerShell) before running pnpm:

```powershell
$env:Path = "C:\Program Files\nodejs;C:\Users\henry\AppData\Roaming\npm;" + $env:Path
```

- Node v24.16.0, pnpm 9.12.0. Repo bootstrapped (`pnpm install` done).
- Useful commands:
  - `pnpm --filter @nexis/payroll test` / `... typecheck`
  - `pnpm --filter @nexis/web typecheck` / `... build`
  - `pnpm --filter @nexis/mobile typecheck`
  - Web e2e: `pnpm --filter @nexis/web exec playwright test` (Chromium installed).
    Needs `apps/web/.env.local` (copy `.env.local.example`) to boot the server;
    the happy-path e2e also needs `E2E_STORAGE_STATE` (a signed-in admin session).

## Git note

These engine changes were pushed **directly to `dev`** per request (not via PR).
Branch convention for normal work is `claude/<stage>-<feature>` + PR into `dev`.
