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
