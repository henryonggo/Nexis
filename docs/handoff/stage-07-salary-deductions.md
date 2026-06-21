# Handoff — Configurable Salary Deductions (selection + groups)

> **Status:** 🟡 **App layer built, awaiting DB.** Branch:
> `claude/salary-deduction-config-y5uv9e`. This doc is the `TODO(db)` tracking
> item per the handoff protocol in `docs/08-agent-boundaries.md`.

## What it does

Admin/owner choose what reduces employee/manager pay. **Nothing is applied by
default.** Two ways to apply deductions:

1. **Reusable group templates** — a named set of deductions; assign people to it
   and edits to the group flow to every member.
2. **Manual per-employee** selection.

Deductions are **statutory** (BPJS Kesehatan, JHT, JP, PPh 21 — computed by the
engine) or **custom** (admin-defined fixed-rupiah or percentage). A non-blocking
**compliance warning** shows when a mandatory statutory deduction is off for an
employee.

## What's already built (Claude, app layer)

- `apps/web/lib/deductions.ts` — constants, types, the resolution rule
  (`resolveEmployeeDeductions`), compliance helper, and `compensation`-boolean
  mapping. **All new-table access goes through a single quarantined cast,
  `newTables()` — delete it and wire generated types once the migration lands.**
- `apps/web/app/(app)/deductions/*` — owner/admin page to manage custom
  deduction types and groups. Route-gated (owner/admin) in `layout.tsx` NAV +
  the page guard; added to nav (`lib/nav.ts`, finance pillar).
- `apps/web/app/(app)/employees/[id]/*` — per-employee picker (group vs manual)
  with the live compliance warning, via `updateEmployeeDeductions`.
- `apps/web/e2e/deductions.spec.ts` — auth-guard + config-surface smoke test.
- i18n: `deductions.*` + `nav.deductions` in `messages/{id,en}.json`.

The UI is fully typed against the local interfaces in `lib/deductions.ts`; only
the DB boundary is cast. The agreed shapes below are what those interfaces expect.

## TODO(db) — required for Antigravity

All tables are **company-scoped**, **integer rupiah** for money (AGENTS rule 3),
and need **RLS**: owner/admin write; the per-employee read used by payroll should
be readable by the worker/service context. Mirror the RLS shape used by
`employee_loans`.

### 1. Table `custom_deduction_types`
| column | type | notes |
|---|---|---|
| id | uuid pk | default gen_random_uuid() |
| company_id | uuid not null → companies(id) on delete cascade | |
| name | text not null | |
| calc | text not null check (calc in ('fixed','percent')) | |
| amount | bigint check (amount >= 0) | **integer rupiah**, set when calc='fixed' |
| rate_bps | int check (rate_bps between 0 and 10000) | basis points, set when calc='percent' |
| base | text check (base in ('gross','base_salary')) | set when calc='percent' |
| active | boolean not null default true | soft-delete flag |
| created_at | timestamptz not null default now() | |

### 2. Table `deduction_groups`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid not null → companies(id) on delete cascade | |
| name | text not null | |
| description | text | |
| active | boolean not null default true | |
| created_at | timestamptz not null default now() | |

### 3. Table `deduction_group_items`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid not null → companies(id) | for RLS |
| group_id | uuid not null → deduction_groups(id) on delete cascade | |
| statutory_code | text check (statutory_code in ('bpjs_kes','jht','jp','pph21')) | null for custom |
| custom_type_id | uuid → custom_deduction_types(id) on delete cascade | null for statutory |

Exactly one of `statutory_code` / `custom_type_id` is set
(`check (num_nonnulls(statutory_code, custom_type_id) = 1)`).

### 4. Table `employee_deduction_group` (assignment)
| column | type | notes |
|---|---|---|
| employee_id | uuid pk → employees(id) on delete cascade | one group per employee |
| company_id | uuid not null → companies(id) | for RLS |
| group_id | uuid not null → deduction_groups(id) on delete cascade | |

The app upserts on `employee_id`.

### 5. Table `employee_deduction` (manual selections)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid not null → companies(id) | for RLS |
| employee_id | uuid not null → employees(id) on delete cascade | |
| statutory_code | text check (... same set ...) | null for custom |
| custom_type_id | uuid → custom_deduction_types(id) on delete cascade | null for statutory |
| enabled | boolean not null default true | |

Same one-of-two constraint as `deduction_group_items`.

### 6. Column `compensation.pph21_enrolled boolean not null default true`
The only statutory deduction lacking a toggle. The app already syncs
`bpjs_kes_enrolled / bpjs_tk_enrolled / jht_enrolled / jp_enrolled` from the
resolved set; once this column exists, also wire it in
`updateEmployeeDeductions` (search the `TODO(db)` there).

### 7. `payroll_items` custom-deduction breakdown
Add `custom_deduction bigint not null default 0` (total custom deductions for the
period) and a child table for the line items so payslips can itemize:
```
payroll_item_deductions(
  id uuid pk, payroll_item_id uuid → payroll_items(id) on delete cascade,
  custom_type_id uuid → custom_deduction_types(id),
  label text, amount bigint not null   -- integer rupiah
)
```

## Worker changes (services/payroll-worker — Antigravity lane)

1. **Resolve effective deductions** per employee using the resolution rule in
   `apps/web/lib/deductions.ts` (group assignment wins, else manual rows, else
   none). The statutory half already works today via the `compensation`
   enrollment booleans the app syncs — no change needed there beyond honoring
   `pph21_enrolled`.
2. **Compute + subtract custom deductions** from net pay at the same insertion
   point as `loan_deduction` (see `docs/handoff/stage-07-loans.md`):
   - `fixed` → `amount`; `percent` → `percentBps(base, rate_bps)` where `base`
     is gross or base salary. Use `@nexis/money` (`percentBps`, `subtract`).
   - Write the total to `payroll_items.custom_deduction` and the line items to
     `payroll_item_deductions`.

## Compliance note

Defaulting deductions to **unselected** is a deliberate product decision
(confirmed with the user) and **conflicts with Indonesian law** — BPJS and PPh 21
are mandatory. The app surfaces a non-blocking warning when statutory deductions
are off. The worker must NOT silently re-enable them; it computes exactly the
resolved set. Flag this in any compliance review.

## After the migration lands

1. Regenerate `packages/types`.
2. In `apps/web/lib/deductions.ts`, delete `newTables()` and type the queries
   against the generated `Database` tables; remove the `any` row mappers' casts.
3. Wire `compensation.pph21_enrolled` in
   `apps/web/app/(app)/employees/[id]/actions.ts` (the `TODO(db)` there).
4. Remove this status banner once the worker subtracts custom deductions.
