# Handoff — Stage 7: Loans & Advances (Kasbon)

> **Status:** app layer built (Claude), **blocked on schema (Antigravity)**.
> Branch: `claude/stage-07-loans`. This doc is the `TODO(db)` tracking item per the
> handoff protocol in `docs/08-agent-boundaries.md`.

## What's already built (Claude, app layer)

- `apps/web/lib/loans.ts` — data access + RPC wrappers. All Supabase calls go
  through a single quarantined cast (`loanDb()`) so the branch typechecks before
  the tables exist. **Delete that cast and wire generated types once the migration
  lands.**
- `apps/web/app/(app)/loans/*` — admin/manager page: request form, approval queue,
  history table. Route-gated (owner/admin/manager), added to nav + middleware.
- `apps/web/e2e/loans.spec.ts` — auth-guard + queue smoke test.

The UI is fully typed against local interfaces in `lib/loans.ts`; only the DB
boundary is cast. The agreed shapes below are what those interfaces expect.

## TODO(db) — required for Antigravity

### 1. Enum
```sql
create type loan_status as enum
  ('pending','approved','active','settled','rejected','cancelled');
```

### 2. Table `employee_loans`
| column | type | notes |
|---|---|---|
| id | uuid pk | default gen_random_uuid() |
| company_id | uuid not null → companies(id) on delete cascade | |
| employee_id | uuid not null → employees(id) on delete cascade | |
| principal | bigint not null check (principal > 0) | **integer rupiah** (AGENTS rule 3) |
| installments | int not null check (installments between 1 and 60) | months |
| installment_amount | bigint not null check (installment_amount >= 0) | round(principal / installments) |
| reason | text | |
| status | loan_status not null default 'pending' | |
| decision_note | text | |
| decided_at | timestamptz | |
| decided_by | uuid → auth.users(id) | |
| disbursed_at | timestamptz | set when approved/active |
| created_at | timestamptz not null default now() | |

The list query also selects `next_due_year` / `next_due_month` — expose these as a
view or generated columns derived from the next `scheduled` installment (or change
`lib/loans.ts` `SELECT` if you model it differently; just keep the names or tell me).

### 3. Table `loan_installments` (deduction schedule)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid not null → companies(id) | for RLS |
| loan_id | uuid not null → employee_loans(id) on delete cascade | |
| sequence | int not null | 1..installments |
| due_year | int not null | |
| due_month | int not null | |
| amount | bigint not null | integer rupiah |
| status | text not null check (status in ('scheduled','deducted','skipped')) default 'scheduled' | |
| payroll_run_id | uuid → payroll_runs(id) | set when deducted |
| paid_at | timestamptz | |

### 4. RPCs (security definer, mirror `approve_claim`)
```text
request_loan(p_employee_id uuid, p_principal bigint, p_installments int, p_reason text)
  returns uuid            -- inserts employee_loans (status pending), computes installment_amount
approve_loan(p_loan_id uuid)
  returns void            -- pending → active, set disbursed_at, generate loan_installments schedule
reject_loan(p_loan_id uuid, p_decision_note text default null)
  returns void            -- pending → rejected
```
All three: assert caller is owner/admin/manager of the loan's company; write an
`audit_logs` row (`request_loan` / `approve_loan` / `reject_loan`) so it shows up in
the audit center (`apps/web/lib/audit.ts` already labels these action strings).

### 5. RLS
- `employee_loans`, `loan_installments`: enable RLS.
- select: owner/admin/manager of `company_id` (queue), **plus** the employee may read
  their own (`employee_id` maps to the caller via `employees.user_id = auth.uid()`).
- insert/update: via the RPCs only (no direct client writes).
- pgTAP: cross-company isolation + employee-sees-own-only.

### 6. Payroll deduction hook (engine + worker)
When a run is processed, active loans' `scheduled` installment for that period must
become an employee deduction and flip to `deducted` (link `payroll_run_id`). The pure
calc belongs in `packages/payroll` (Claude) but it needs the worker
(`services/payroll-worker`, Antigravity) to load due installments and persist the
status flip. Let's spec the exact seam together once the tables exist.

### 7. Regenerate types
`pnpm db:types` so `employee_loans` / `loan_installments` / the RPCs land in
`packages/types`. Then Claude deletes `loanDb()` and points at generated types,
removing every `TODO(db)` in `apps/web/lib/loans.ts`.

## Acceptance (when both halves land)
- Manager requests a loan; it appears in the queue; approve generates a schedule.
- Next payroll run for that employee deducts one installment; loan shows `active`
  with the next due period; final installment flips status to `settled`.
- Employee sees only their own loans; all role-gated and audited.
