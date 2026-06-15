# Spec — Analytics & HR reporting dashboard — 🟡 PROPOSED (mostly Claude)

> **Owner:** Claude (app-side reads + charts); Antigravity only if scale forces DB aggregation.
> Post-beta. Source: `docs/10-beta-workflow-painpoints.md` "NOT in beta" (nice-to-have).

## Current state (already built)

`/analytics` (owner/admin) renders from `apps/web/lib/analytics.ts` — pure app-side aggregation
over existing tables, no DB views:
- KPIs: active headcount, last-run gross, employer BPJS, pending approvals.
- Payroll cost trend (`getPayrollTrend`), headcount by department / employment type, leave usage.

This is the baseline. The "reporting dashboard" is the **delta** below.

## Delta to scope (Claude-lane)

1. **Date-range / period filter** — today it's hard-coded (current year, latest runs). Add a
   period picker (last 3/6/12 months, custom) threaded through the `lib/analytics` reads.
2. **Attendance & overtime analytics** — punctuality (on-time vs late from `attendance_records`
   + shift `grace_period_minutes`), overtime-hours trend from approved `overtime_entries`.
3. **Headcount over time / turnover** — joins vs terminations from `employees.join_date` +
   status; simple monthly net-headcount line.
4. **Employer-cost breakdown** — total employer cost (gross + BPJS employer legs) per period and
   per department, from `payroll_items`.
5. **Export** — CSV/PDF of the current view; reuse the signed-URL route pattern from
   `payroll/[runId]/payslip` if PDF, or a client CSV for tables.

All read from tables that already exist; charts reuse `analytics/charts.tsx` primitives.

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
