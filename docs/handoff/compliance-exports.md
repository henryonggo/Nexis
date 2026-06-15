# Handoff — Compliance exports (e-Bupot + BPJS SIPP) — 🟡 OPEN (Antigravity)

> **Owner:** Antigravity (export generation, Edge fn / DB) → Claude (download UI).
> Post-beta. Tracking item per `docs/08-agent-boundaries.md`. Source:
> `docs/10-beta-workflow-painpoints.md` "NOT in beta" (filing-format output).

## Problem

A completed payroll run holds everything needed to file, but there is no way to **emit the
official filing artefacts**:
- **e-Bupot 21** (DJP / PPh 21 withholding slips) per employee per period.
- **BPJS SIPP** upload file (contributions per employee — Kesehatan + Ketenagakerjaan).

Today HR re-keys this into government portals by hand — the exact pain Nexis removes after
payroll is trusted. All source data exists; only the format generation is missing.

## Data sources (already present)

- `payroll_items` (per run): `pph21`, `gross_pay`, `ter_category`, `ter_rate_bps`,
  `bpjs_kes_employee/_employer`, `jht_employee/_employer`, `jp_employee/_employer`,
  `jkk_employer`, `jkm_employer`, `base_salary`, `employee_id`.
- `payroll_runs`: `period_year`, `period_month`, `status` (completed/paid).
- `tax_profile`: employee `npwp`, `ptkp_status`, `has_npwp`.
- `company_billing`: company `npwp`, `bpjs_kes_no`, `bpjs_tk_no`.
- `employees`: `full_name`, `nik`.

## TODO (Antigravity) — pick the seam

Generate the two artefacts for a given `payroll_run_id` (completed/paid only):

1. **e-Bupot 21** — the DJP-prescribed layout (CSV/XML per the current e-Bupot scheme).
   One record per employee: company NPWP, employee NPWP/NIK, gross, PPh 21 withheld, TER
   category/rate, period. No-NPWP rows carry the +20% already in `pph21`.
2. **BPJS SIPP** — the SIPP bulk-upload layout: per employee, the Kesehatan + TK wage base
   and each contribution leg, plus the company BPJS registration numbers.

Seam options (Antigravity's call):
- An **Edge function** `generate-compliance-export(run_id, kind)` (mirror `send-notification`
  / `public-api` patterns) that returns the file, or writes it to a private storage bucket and
  returns a path; **or**
- A **DB RPC** returning rows the app formats. Prefer the Edge fn — the layouts are
  format-heavy and version with regulation.

Add a typed error for "run not completed" and "missing company NPWP/BPJS no.".

## App follow-up — Claude

- Download buttons on `/payroll/[runId]` (completed/paid runs) for **e-Bupot** and **SIPP**,
  same signed-URL/redirect pattern as the payslip route
  (`payroll/[runId]/payslip/[payslipId]/route.ts`). i18n + role gate (owner/admin).

## Acceptance

- For a completed run, owner/admin downloads a DJP-valid e-Bupot file and a SIPP-valid upload
  file; numbers reconcile to `payroll_items` to the rupiah.
- Blocked with a clear message when company NPWP / BPJS numbers are unset.
