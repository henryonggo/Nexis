# Spec — Analytics & HR reporting dashboard — 🟢 DB DONE / 🟡 APP PROPOSED

> **Owner:** Claude (app-side reads + charts); Antigravity only if scale forces DB aggregation.
> Post-beta. Source: `docs/10-beta-workflow-painpoints.md` "NOT in beta" (nice-to-have).

## Current state (already built)

`/analytics` (owner/admin) renders from `apps/web/lib/analytics.ts` — pure app-side aggregation
over existing tables, no DB views:
- KPIs: active headcount, last-run gross, employer BPJS, pending approvals.
- Payroll cost trend (`getPayrollTrend`), headcount by department / employment type, leave usage.

This is the baseline. The "reporting dashboard" is the **delta** below.

## Delta — status

1. ✅ **Period filter** — `?months=3|6|12` threading the trend reads (`period-filter.tsx`).
2. ✅ **Overtime-hours trend** — `getOvertimeTrend` (approved `overtime_entries`, per month).
   ✅ **Punctuality** — `getPunctuality` (on-time vs late clock-ins vs scheduled shift start +
   `grace_period_minutes`, WIB).
3. ⏳ **Turnover** — **DB complete.** Net headcount over time needs termination timing;
   `employees.termination_date` column is added to the database.
4. ✅ **Employer-cost breakdown** — `getEmployerCostByDept` (gross + employer BPJS legs from the
   latest finalized run's `payroll_items`, by department).
5. ✅ **Export** — client-side CSV of the current view (`export-button.tsx`).

All shipped items read from existing tables; charts reuse `analytics/charts.tsx`.

## TODO(db) — Antigravity (unblocks turnover) — ✅ DONE

```sql
-- employees.termination_date (date, nullable) is added to employees table.
```

After it lands: a `getHeadcountOverTime(months)` reading `join_date` (joins) + `termination_date`
(leavers) for a net-headcount line. Claude-lane once the column exists.

## DB seam — only if scale demands it (Antigravity, optional)

App-side aggregation is fine for beta-size companies. For large tenants (thousands of
`payroll_items` / `attendance_records`), move the heavy rollups to **aggregate RPCs** or
**materialized views** (e.g. `analytics_payroll_monthly`, `analytics_attendance_daily`) so the
page doesn't scan raw rows. Mark `TODO(db)` *only* when a real perf problem appears — do not
pre-build.

## Acceptance

- Owner/admin filters analytics by period; attendance/overtime/turnover/cost views render from
  real data; a report exports.
- Non-admin still blocked (existing gate).

## Out of scope

Per-employee performance analytics (separate product surface, stage-7 performance owns it).
