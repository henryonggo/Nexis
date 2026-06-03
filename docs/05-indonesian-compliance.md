# 05 — Indonesian Payroll & Compliance Reference

> Source of truth for the payroll engine (`packages/payroll`). **All rates below are seed data for the versioned reference tables** (`ptkp_rates`, `tax_brackets`, `ter_rates`, `bpjs_config`). Never hardcode them in business logic — read them from the DB by effective date so the engine stays correct as the law changes.
>
> ⚠️ Rates here reflect the rules as of the 2024–2026 period and must be re-verified against the latest DJP / BPJS / Kemnaker regulations before each tax year. Treat the *method* as stable and the *numbers* as configuration.

## 1. PPh 21 — Income Tax (TER method, PMK 168/2023)

Since **January 2024**, monthly withholding uses the **TER (Tarif Efektif Rata-rata / Average Effective Rate)** method:

- **Monthly (Jan–Nov):** `PPh21_month = gross_monthly_income × TER_rate(category, gross)`.
  - The TER **category (A / B / C)** is determined by the employee's **PTKP status**:
    - **TER A:** TK/0, TK/1, K/0
    - **TER B:** TK/2, TK/3, K/1, K/2
    - **TER C:** K/3
  - Within a category, the effective rate is looked up by gross monthly income band (rates range from 0% at low income up to ~34% at very high income).
- **December (annual reconciliation):** recompute full-year tax with the **progressive bracket method** (below), subtract the TER amounts already withheld Jan–Nov; the difference is December's withholding.
- **No-NPWP surcharge:** employees without an NPWP are withheld at **120%** of the normal PPh 21 (i.e. +20%). Track via `tax_profile.has_npwp`.

### Progressive annual brackets (UU HPP) — used for the December reconciliation

Applied to annual **PKP** (taxable income = annual net income − PTKP):

| Annual PKP (IDR) | Rate |
|---|---|
| 0 – 60,000,000 | 5% |
| 60,000,001 – 250,000,000 | 15% |
| 250,000,001 – 500,000,000 | 25% |
| 500,000,001 – 5,000,000,000 | 30% |
| > 5,000,000,000 | 35% |

### PTKP — Non-taxable income (annual)

| Status | Annual PTKP (IDR) |
|---|---|
| TK/0 (single, no dependents) | 54,000,000 |
| K/0 (married, no dependents) | 58,500,000 |
| Each dependent (max 3) | +4,500,000 |

So K/2 = 58,500,000 + 2×4,500,000 = 67,500,000, etc. Dependents capped at 3.

### Annual net income for reconciliation

`annual_net = annual_gross − occupational_cost − employee_pension/JHT contributions`.
**Occupational cost (biaya jabatan):** 5% of gross, **capped at IDR 6,000,000/year** (IDR 500,000/month).

## 2. BPJS Kesehatan (health insurance)

- Total premium **5% of monthly salary**, split: **employer 4%**, **employee 1%**.
- **Wage ceiling:** salary above the cap is treated as the cap for the calculation (verify current ceiling each year; historically IDR 12,000,000/month).
- Covers the worker + up to a defined number of family members.

## 3. BPJS Ketenagakerjaan (employment social security)

| Program | Employee | Employer | Notes |
|---|---|---|---|
| **JHT** (Old-Age Savings) | 2% | 3.7% | of monthly wage |
| **JP** (Pension) | 1% | 2% | capped at a max wage ceiling (IDR 10,547,400/month for 2025, indexed yearly) |
| **JKK** (Work Accident) | — | 0.24%–1.74% | by industry risk class (very low 0.24%, low 0.54%, medium 0.89%, high 1.27%, very high 1.74%) |
| **JKM** (Death) | — | 0.30% | of monthly wage |

`company_settings.jkk_risk_class` selects the JKK rate. Office/admin businesses default to **very_low (0.24%)**.

## 4. Overtime (lembur) — Kepmenaker / UU Cipta Kerja

- **Hourly base:** `1/173 × monthly wage`.
- **Weekday overtime:** 1st hour ×1.5; 2nd–8th hour ×2.0.
- **Rest day / public holiday (5-day workweek):** 1st–8th hour ×2.0; 9th hour ×3.0; 10th–11th hour ×4.0.
- Overtime applies to non-managerial staff per regulation; configurable per employee.

## 5. THR (Tunjangan Hari Raya) — mandatory religious holiday bonus

- **≥12 months service:** 1 month's salary.
- **<12 months:** prorated = `(months_worked / 12) × monthly_salary`.
- Must be paid before the relevant religious holiday (e.g. ≥7 days before Idul Fitri).
- Implement as a dedicated THR payroll run type in Stage 4+.

## 6. Minimum wage (UMP/UMR)

Set provincially and updated yearly (PP 51/2023, later PP 49/2025 formula = inflation + economic-growth × alpha). Examples: **Jakarta UMP 2026 ≈ IDR 5,729,876/month**; national UMK average ≈ IDR 3.4M; lowest ≈ IDR 2.3M. Use as a validation warning (flag salaries below regional minimum), not a hard block — store per-company region and a `minimum_wage` reference if needed.

## 7. Payroll engine algorithm (deterministic)

For each employee in a monthly run:

```
1. gross = base_salary + sum(fixed_allowances) + overtime_pay + variable_earnings
2. BPJS (employee side):
     kes_emp = 1%  × min(salary, kes_cap)
     jht_emp = 2%  × salary
     jp_emp  = 1%  × min(salary, jp_cap)
   BPJS (employer side):
     kes_empr = 4%   × min(salary, kes_cap)
     jht_empr = 3.7% × salary
     jp_empr  = 2%   × min(salary, jp_cap)
     jkk_empr = jkk_rate(risk_class) × salary
     jkm_empr = 0.30% × salary
3. PPh 21 (Jan–Nov): ter_rate = lookup(category(PTKP), gross); pph21 = gross × ter_rate
     if !has_npwp: pph21 = pph21 × 1.20
   (December: full progressive reconciliation, subtract YTD TER withheld)
4. net_pay = gross − (kes_emp + jht_emp + jp_emp) − pph21 − other_deductions
5. round everything to whole rupiah (bigint); store breakdown jsonb for the payslip
```

**Reproducibility:** snapshot the exact rate rows used into `payroll_runs.config_snapshot` and `payroll_items.ter_rate_bps` so a run computed today never changes when next year's rates are loaded.

## 8. Other compliance touchpoints (later stages)

- **e-Bupot / SPT PPh 21** export formats for DJP filing (Stage 6).
- **BPJS reporting** (SIPP) export (Stage 6).
- **UU PDP (Personal Data Protection, Law 27/2022):** consent, data minimization, breach handling — see `07-security-compliance.md`. This is *why* the free tier collects minimal data.

## 9. Seed data note for the agent

Generate `supabase/seed.sql` populating `ptkp_rates`, `tax_brackets`, `ter_rates`, and `bpjs_config` with the values above, each with `effective_from = '2024-01-01'`. Build a fixtures file in `packages/payroll/test/fixtures/` with at least 6 worked examples (different PTKP statuses, with/without NPWP, with overtime, at/over BPJS caps) and assert exact net-pay outputs in unit tests.

---

### Sources (verify yearly)

- DJP PMK 168/2023 (TER method) and UU HPP brackets.
- BPJS Kesehatan (Perpres) and BPJS Ketenagakerjaan (JHT/JP/JKK/JKM) regulations.
- Kepmenaker / UU 6/2023 (Cipta Kerja) overtime & THR rules.
- PP 51/2023 & PP 49/2025 minimum wage formula.
