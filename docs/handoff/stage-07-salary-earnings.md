# Handoff — Working days, daily/mixed salary & configurable earnings (allowances)

> **Status:** 🟡 **App layer built, awaiting DB.** Branch:
> `claude/pensive-hopper-vp10yb`. This doc is the `TODO(db)` tracking item per the
> handoff protocol in `docs/08-agent-boundaries.md`. It is the income-side mirror
> of `docs/handoff/stage-07-salary-deductions.md`.

## What it does

Three related additions, all owner/admin:

1. **Company working days** — a standard *paid working days per month* figure
   (default 22) plus the workweek length, set on the Settings page. It scales
   daily/mixed salaries and caps how many days a daily/mixed employee is paid for.
2. **Daily / mixed salary** — a new `mixed` pay frequency. A "mixed" employee has
   **two boxes**: a fixed **monthly salary** and a **daily rate**; they earn
   `monthly + dailyRate × daysWorked`. Part-timers can be `daily` or `mixed` and
   carry **their own working-days override**.
3. **Configurable earnings / allowances (tunjangan)** — break a salary into named
   components beyond base pay (tunjangan makan, kendaraan, kompensasi PKWT, …).
   Same model as deductions: reusable **group templates** applied to a class of
   employees, or **manual per-employee** selection with an optional **per-person
   fixed-amount override** ("adjusted per employee"). Each type carries a
   `taxable` flag.

## What's already built (Claude, app layer)

- `packages/payroll/src/index.ts` — pure `computeEarnedBase({payFrequency, monthlyBase, dailyRate, daysWorked})` and `monthlyToDailyRate(...)`, with tests in `index.test.ts`. Reused by the preview and (to be) the worker.
- `apps/web/lib/earnings.ts` — constants, types, the resolution rule (`resolveEmployeeEarnings`), a **bulk** loader/resolver for the run preview (`loadBulkEarnings` / `resolveFromBulk`), and line/total helpers (`computeEarningLines`, `sumTaxableEarnings`). **All new-table access goes through the same quarantined cast the deductions feature uses (`newTables`) — delete it and wire generated types once the migration lands.**
- `apps/web/app/(app)/earnings/*` — owner/admin page to manage allowance types and groups. Route-gated in `layout.tsx` NAV + the page guard; added to nav (`lib/nav.ts`, finance pillar).
- `apps/web/app/(app)/employees/[id]/*` — per-employee allowance picker (group vs manual, with per-person override) via `updateEmployeeEarnings`; and the **mixed pay / daily rate / working-days override** fields on the compensation form (`updateEmployee`).
- `apps/web/app/(app)/settings/*` — company working-days section (`updatePayrollSettings`).
- `apps/web/lib/payroll.ts` — run preview computes earned base for monthly/daily/mixed and folds resolved **taxable** earnings into gross.
- `apps/web/e2e/earnings.spec.ts` — auth-guard + config-surface smoke test.
- i18n: `earnings.*`, `nav.earnings`, `settings.payroll.*`, and new `employees.form.*` keys in `messages/{id,en}.json`.

The UI is fully typed against the local interfaces in `lib/earnings.ts`; only the
DB boundary is cast. The agreed shapes below are what those interfaces expect.

## TODO(db) — required for Antigravity

All tables are **company-scoped**, **integer rupiah** for money (AGENTS rule 3),
and need **RLS** mirroring `custom_deduction_types` / `employee_loans`: owner/admin
write; the per-employee read used by payroll readable by the worker/service context.

### 1. New columns on existing tables

| Table.column | type | notes |
|---|---|---|
| `compensation.daily_rate` | bigint not null default 0 | integer rupiah; daily portion of daily/mixed pay |
| `compensation.working_days_override` | int check (working_days_override between 0 and 31) | nullable; part-timer's own working days/month |
| `company_settings.working_days_per_month` | int not null default 22 check (between 1 and 31) | company standard paid days/month |
| **`compensation.pay_frequency` check constraint** | widen to `in ('monthly','daily','mixed')` | currently only `monthly`/`daily` (see `20260619100000_daily_payroll_support.sql`) — **the app writes `mixed` and it will fail until this is widened** |

### 2. Table `custom_earning_types`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| company_id | uuid not null → companies(id) on delete cascade | |
| name | text not null | |
| calc | text not null check (calc in ('fixed','percent')) | |
| amount | bigint check (amount >= 0) | integer rupiah, set when calc='fixed' |
| rate_bps | int check (rate_bps between 0 and 10000) | basis points, set when calc='percent' |
| base | text check (base in ('gross','base_salary')) | set when calc='percent' |
| taxable | boolean not null default true | counts toward taxable gross |
| active | boolean not null default true | soft-delete flag |
| created_at | timestamptz not null default now() | |

### 3. Table `earning_groups`
`id` uuid pk, `company_id` uuid not null → companies, `name` text not null,
`description` text, `active` boolean not null default true, `created_at` timestamptz.

### 4. Table `earning_group_items`
`id` uuid pk, `company_id` uuid not null (RLS), `group_id` uuid not null →
`earning_groups(id)` on delete cascade, `custom_type_id` uuid not null →
`custom_earning_types(id)` on delete cascade.

### 5. Table `employee_earning_group` (assignment)
`employee_id` uuid pk → employees on delete cascade (one group per employee),
`company_id` uuid not null (RLS), `group_id` uuid not null → `earning_groups(id)`
on delete cascade. The app upserts on `employee_id`.

### 6. Table `employee_earning` (manual selections)
`id` uuid pk, `company_id` uuid not null (RLS), `employee_id` uuid not null →
employees on delete cascade, `custom_type_id` uuid not null →
`custom_earning_types(id)` on delete cascade, `amount_override` bigint check
(amount_override >= 0) **nullable** (per-person fixed-amount override; null = use
the type's amount), `enabled` boolean not null default true.

### 7. `payroll_items` earnings breakdown (payslip itemization)
Mirror the deduction itemization. Add a child table so payslips can show the
breakdown seen in the example slip (Gaji, Transport Allowance, Kompensasi PKWT, …):
```
payroll_item_earnings(
  id uuid pk, payroll_item_id uuid → payroll_items(id) on delete cascade,
  custom_type_id uuid → custom_earning_types(id), label text,
  amount bigint not null,        -- integer rupiah
  taxable boolean not null default true
)
```

## Worker changes (services/payroll-worker — Antigravity lane)

1. **Earned base** per employee via `computeEarnedBase` (already in `@nexis/payroll`):
   monthly → monthly base; daily → `daily_rate × daysWorked`; mixed →
   `monthly + daily_rate × daysWorked`. Cap `daysWorked` at
   `working_days_override ?? company_settings.working_days_per_month` (the preview
   in `apps/web/lib/payroll.ts` does exactly this — keep them in lockstep).
2. **Resolve earnings** per employee using the rule in `lib/earnings.ts` (group
   assignment wins, else manual rows, else none). Add **taxable** earning lines to
   taxable gross; add **non-taxable** lines to net pay *after* tax. Write the
   breakdown to `payroll_item_earnings`.
3. Keep the daily-pay legacy path working: the app mirrors a daily employee's rate
   into `base_salary` too, so existing logic is unaffected until it reads `daily_rate`.

## After the migration lands

1. Regenerate `packages/types`.
2. In `apps/web/lib/earnings.ts`, delete the `newTables` usage and type the queries
   against the generated `Database` tables; do the same for the `compensation` /
   `company_settings` reads/writes in `employees/[id]/{page,actions}.ts`,
   `settings/{page,actions}.ts`, and `lib/payroll.ts`.
3. Remove this status banner once the worker computes earnings + earned base.
