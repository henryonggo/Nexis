# Continue here — Claude Code working notes

_Last updated: 2026-06-03. This is Claude Code's scratch/handoff note (app-layer
lane). Not authoritative — `AGENTS.md` + `docs/` win. Safe to delete anytime._

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

## ▶️ Pick up tomorrow here (Stage 4, rest of it)

**Blocked on Antigravity (DB seam) — these don't exist in `packages/types` yet:**
- Reference tables `ter_rates`, `tax_brackets`, `ptkp_rates`, `bpjs_config`
  (seed values are in `docs/05-indonesian-compliance.md`).
- Run tables `payroll_runs`, `payroll_items`, `payslips` (+ RLS).
- Cloud Run `services/payroll-worker` (Antigravity lane).

**Once those land + types regenerate, Claude's remaining Stage 4 work:**
1. Build a config loader that maps the reference-table rows → `PayrollConfig` /
   `AnnualTaxConfig` / `TerRateRow[]` and feeds the engine (replace `fixtures.ts`
   representative rates with real reference rows by effective date).
2. Web payroll UI: list, run wizard (period + input/warnings e.g. salary < UMR),
   per-employee review (gross / each BPJS line both sides / PPh21 TER cat+rate /
   net), approve, mark paid.
3. Mobile: employee payslip view + download (signed URL).
4. Playwright happy-path for a payroll run; i18n strings (id-ID + en).
5. Verify acceptance criteria in `docs/stages/stage-04-payroll.md` (esp. #1 done,
   #3 breakdown, #5 reproducibility via config snapshot, #7 THR proration).

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
