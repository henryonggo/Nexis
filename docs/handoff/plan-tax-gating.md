# Handoff — Plan / NPWP gating for tax-affecting runs — 🟡 OPEN (Antigravity)

> **Owner:** Antigravity (enforcement in DB/worker). Tracking item per
> `docs/08-agent-boundaries.md`. Source: `docs/cases/case-02-attendance-to-first-payroll.md`
> step 42, Gap G9(c).

## Problem

The roadmap rule: **full payroll automation / official tax filing requires a paid plan and a
company NPWP.** Today `payroll_runs` records the `plan` and the app surfaces a soft notice
(free-plan >5 employees, no-NPWP +20%), but nothing **enforces** the gate — a free-plan or
no-NPWP company can still approve and process a tax-affecting run. The plan is stored but not
checked at the seam that matters.

## Desired behaviour (to confirm with product)

- A **monthly (tax-affecting) run** on the **free plan** may preview but must not be
  **approved/processed** beyond the free limit — block at approval with a clear upgrade path.
- A run that will **file/report PPh 21 officially** requires the **company NPWP** to be set.
  Missing company NPWP → block official processing (estimate-only is fine).
- THR-only and pure-estimate previews stay unblocked.

## TODO(db / worker) — Antigravity

Pick the enforcement seam (DB constraint/RLS vs worker guard) and implement:

1. Ensure a **company NPWP** field exists (`companies` / `company_settings`) and is readable
   for the check. If absent, add it (`TODO(db)`) and regenerate types.
2. Enforce the gate where a run leaves `draft` (approval → queued) or where the **worker**
   begins processing: reject with a typed error (e.g. `PLAN_GATE_FREE`, `NPWP_REQUIRED`) the
   app can map to a localized message + upgrade link.
3. pgTAP / worker test: free-plan tax-affecting run blocked; paid + NPWP allowed; THR/preview
   unaffected.

## App follow-up — Claude (after the gate + error codes land)

- `payroll/actions.ts` `approveRun`: map the typed errors to localized messages (reuse the
  `upgrade` link pattern from `employees/actions.ts` `FREE_SEAT_LIMIT_REACHED`).

## Acceptance

- Free-plan monthly run cannot be approved past the limit; message points to billing.
- No company NPWP → official processing blocked; estimate still works.
