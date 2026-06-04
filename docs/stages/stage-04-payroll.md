# Stage 4 — Payroll Engine (Spec) ⭐ compliance-critical

> The highest-risk stage. Read `05-indonesian-compliance.md` fully. Build the engine as a **pure, exhaustively unit-tested library** first, then wire the async run pipeline. Re-verify all rates against current DJP/BPJS regulations before shipping.

## Objective

Run a compliant monthly payroll producing correct gross, BPJS (employee + employer), PPh 21 (TER), overtime, deductions, net pay, and downloadable payslips — reproducibly.

## Architecture (see `01-architecture.md`)

`packages/payroll` (pure TS) → used by `services/payroll-worker` (Cloud Run) → triggered via Cloud Tasks from a Next.js server action → status streamed back via Realtime. Payslip PDFs rendered to Cloud Storage.

## Scope

**Engine (`packages/payroll`)**
- Implement, reading rates from reference tables by effective date:
  - Gross assembly (base + fixed allowances + overtime + variable).
  - Overtime pay (1/173 base; weekday 1.5×/2×; rest-day/holiday 2×/3×/4×).
  - BPJS employee: Kes 1% (capped), JHT 2%, JP 1% (capped); employer: Kes 4% (capped), JHT 3.7%, JP 2% (capped), JKK by risk class, JKM 0.30%.
  - PPh 21 TER (Jan–Nov): category by PTKP (A/B/C) × income-band effective rate; **×1.20 if no NPWP**.
  - December reconciliation: progressive brackets on annual PKP, minus biaya jabatan (5%, cap 6M/yr) and pension/JHT, minus YTD TER withheld.
  - Net pay; full itemized `breakdown` JSON.
- Pure functions, integer rupiah, deterministic rounding. **≥ 6 fixture cases** with hand-verified outputs.

**Pipeline**
- Payroll run lifecycle: `draft → queued → processing → completed → paid` (+ `failed`, `cancelled`).
- Enqueue with idempotency key (no double runs / double pay).
- Cloud Run worker loads employees/compensation/attendance/config, computes, writes `payroll_items` + employer costs, renders payslip PDFs, snapshots config into `payroll_runs.config_snapshot` and per-item `ter_rate_bps`.
- **THR run type** (1 month salary, prorated < 12 months).

**UI**
- Web: payroll list, run wizard (pick period, review inputs/warnings e.g. salary below UMR), review screen (per-employee breakdown), approve, mark paid.
- Mobile: employee views/downloads payslip; push notification on issue.

**Gating**
- Tax-affecting/official payroll (and filing exports) require paid plan + company NPWP. Free plan can run payroll for ≤5 employees but is reminded that official tax filing needs company tax details.

## Data touched

`payroll_runs`, `payroll_items`, `payslips`, reads `employees`/`compensation`/`tax_profile`/`attendance`/reference tables. RLS: admins manage; employees self-read their payslips.

## Acceptance criteria

1. Engine unit tests pass to-the-rupiah against all fixtures (incl. no-NPWP +20%, at/over BPJS caps, with overtime).
2. A monthly run for a seeded company completes async via Cloud Run; statuses stream to web.
3. Per-employee breakdown shows gross, each BPJS line (both sides), PPh 21 (with TER category/rate), deductions, net.
4. Payslip PDFs generate to private storage and download via signed URL.
5. **Reproducibility:** loading next-year rates does not change a completed historical run.
6. Idempotency: re-submitting the same run does not duplicate items/pay.
7. THR run prorates correctly for <12-month tenure.
8. RLS: employee sees only their own payslip; cannot see others' pay.

## Cross-agent handoff — current phase (added 2026-06-04)

> Appended per the append-only docs rule (08 §"Conflict-avoidance" #5). Status of
> the seam between Claude (app) and Antigravity (DB/infra) for Stage 4.

### ✅ Done — Claude (app layer)
- `packages/payroll` engine: monthly TER, overtime, December reconciliation, THR
  (rates injected, integer rupiah, 21 tests).
- `packages/payroll/src/config.ts`: pure loaders mapping reference rows →
  engine config — `buildPayrollConfig(bpjs_config, ter_rates)`,
  `buildAnnualTaxConfig(ptkp_rates, tax_brackets)`, `toTerRateRows`,
  `toProgressiveBrackets` (13 tests mirror `supabase/seed.sql` verbatim as a
  seed↔engine contract). **This is the canonical row→config mapping — the Cloud
  Run worker should import and reuse these, not re-implement them.**
- Web UI: `/payroll` list, `/payroll/new` wizard, `/payroll/[runId]` review
  (per-employee breakdown incl. both BPJS sides + TER cat/rate, warnings,
  approve / mark-paid / cancel), nav + middleware guard, i18n (id-ID + en),
  Playwright guard + happy-path specs. typecheck + build green.

### ▶️ Antigravity still owns for Stage 4
1. **Commit the already-applied DB work** (currently uncommitted in the working
   tree): `supabase/migrations/20260603140000_stage4_payroll.sql`,
   `supabase/tests/stage4_payroll.test.sql`, `supabase/seed.sql`,
   regenerated `packages/types/src/database.ts`.
2. **`services/payroll-worker`** (Cloud Run). Contract the app already assumes:
   - App sets `payroll_runs.status = 'queued'` on approve and writes **nothing**
     to `payroll_items`. The worker is the sole writer of `payroll_items` /
     `payslips`.
   - Worker picks up `queued` runs (idempotency key = run id via Cloud Tasks),
     loads employees/compensation/tax_profile/attendance + effective-dated
     reference rows, calls `@nexis/payroll` via the `config.ts` loaders, writes
     `payroll_items` (+ employer costs) and `payslips`, renders payslip PDFs to
     private Storage, snapshots config into `payroll_runs.config_snapshot` and
     per-item `ter_rate_bps` / `ter_category`, and advances
     `processing → completed` (`failed` on error). Overwrite `payroll_runs`
     totals authoritatively (the app pre-fills them from a display-only preview).
   - Deploy note in `services/payroll-worker/README.md` (08 DoD).
3. **Payslip Storage bucket + RLS** (employee self-reads own payslip; signed-URL
   download) — needed for AC #4 and the mobile payslip screen.
4. `TODO(db)` — **`minimum_wages(region, amount, effective_from, effective_to)`**
   reference table so the wizard can warn on salary < UMR. Marker:
   `apps/web/lib/payroll.ts`.

### ✅ Claude follow-ups — DONE (2026-06-04, after worker landed)
- **Worker enqueue on approve.** `apps/web/lib/payroll-worker.ts`
  (`enqueuePayrollRun`) POSTs the worker's `/process {runId}`; wired into
  `approveRun` (rolls the run back to draft if the worker is unreachable so it
  stays retryable). `PAYROLL_WORKER_URL` / `PAYROLL_WORKER_TOKEN` env;
  Cloud Tasks indirection left as a marked `TODO(infra)` seam.
- **runType in the snapshot.** `payroll_runs` has no `run_type` column and the
  worker infers THR from `config_snapshot.runType`, so `createDraftRun` now
  writes `runType` into `config_snapshot` and the review page reads it back.
- **UMR warning.** Resolved the `minimum_wages` `TODO(db)` —
  `apps/web/lib/payroll.ts` warns when base salary < the company region's UMR.
- **Realtime status streaming** (AC #2): `payroll/[runId]/status-stream.tsx`
  subscribes to `payroll_runs` UPDATEs and refreshes on transition.
- **Mobile payslips** (AC #4): `apps/mobile/lib/payslips.ts` +
  `app/(app)/payslips.tsx` tab — lists payslips, opens signed-URL PDF.
- Verified end-to-end against local Supabase + worker: approve → worker
  computes → run `completed`, `payroll_items` written, payslip PDF in the
  `payslips` bucket, signed URL downloads. typecheck + build + e2e (guards +
  happy path) all green.

### ▶️ Remaining Antigravity items
- **`TODO(db)` Realtime publication:** the review screen's live status needs
  `payroll_runs` in the `supabase_realtime` publication (no migration adds any
  table to it yet — same gap likely affects `attendance_records`). Add
  `alter publication supabase_realtime add table public.payroll_runs;`. Until
  then the badge connects but won't receive row events (degrades to manual
  refresh).
- Carried over from Stage 3: confirm `attendance-selfies` bucket policy is wired
  end-to-end (bucket landed in commit 23bec8a).
