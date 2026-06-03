# 03 — Database Schema (Supabase / Postgres) + RLS

This is the authoritative data model. **Read it before writing any data code.** The defining requirement: **one user can belong to many companies, with a distinct role per company**, and **no user can ever read or write another company's data**. Isolation is enforced by Row Level Security (RLS), not by application code.

## Tenancy model in one paragraph

We use **shared-schema multi-tenancy**. Every tenant-scoped table has a `company_id`. A join table `company_members` maps `(user_id, company_id) → role`. RLS policies call small `SECURITY DEFINER` helper functions that check membership and role from `company_members` using `auth.uid()`. The `company_id` is the tenant key throughout.

## Entity overview

```
auth.users (Supabase-managed)
   │ 1─1
profiles ──────────────┐
   │ M                 │
company_members ───────┤  (user_id, company_id, role)  ← the multi-company bridge
   │ M                 │
companies ─────────────┘
   │ 1─M
   ├── company_settings        (timezone, locale, free-tier flags)
   ├── company_billing         (plan, NPWP & legal info — nullable while free)
   ├── employees ──────────────┐
   │      ├── employment_details (join date, type, status)
   │      ├── compensation       (base salary, allowances, BPJS/PPh config)
   │      ├── bank_accounts
   │      └── tax_profile        (PTKP status, NPWP — employee level)
   ├── invitations              (pending member invites)
   ├── attendance_records       (clock in/out, GPS, selfie)
   ├── work_schedules / shifts
   ├── leave_types / leave_requests / leave_balances
   ├── claim_types / reimbursement_claims
   ├── payroll_runs ────────────┐
   │      ├── payroll_items       (per-employee result, snapshotted)
   │      └── payroll_config_snapshot (rates used, for reproducibility)
   ├── payslips                  (PDF pointer in Cloud Storage)
   └── audit_logs

Reference (global, read-mostly, not tenant-scoped):
   ├── tax_brackets        (PPh 21 progressive brackets, versioned)
   ├── ter_rates           (PPh 21 TER effective rates by category, versioned)
   ├── ptkp_rates          (non-taxable income thresholds, versioned)
   └── bpjs_config         (BPJS rates/caps, versioned)
```

## Roles (per company)

Stored as an enum on `company_members.role`:

| role | meaning | typical capabilities |
|---|---|---|
| `owner` | created/owns the company | everything incl. billing, delete company, manage members |
| `admin` | HR/Finance operator | manage employees, attendance, run payroll, reports (no billing/delete) |
| `manager` | team lead | approve leave/claims, view team attendance, read-only payroll for their team |
| `employee` | self-service | own profile, own attendance, own payslips, submit leave/claims |

A user can be `owner` of Company A and `employee` of Company B simultaneously — roles are per `(user_id, company_id)` row.

---

## SQL — core schema & RLS

> These are written as migration-ready SQL. Split across files under `supabase/migrations/` in practice; presented together here. Postgres 15+. All money is `bigint` whole rupiah.

### 0. Extensions & enums

```sql
create extension if not exists "pgcrypto";

create type company_role as enum ('owner','admin','manager','employee');
create type plan_tier   as enum ('free','starter','growth','enterprise');
create type employee_status as enum ('active','probation','inactive','terminated');
create type employment_type as enum ('permanent','contract','intern','daily');
create type pay_period_status as enum ('draft','queued','processing','completed','failed','paid','cancelled');
create type attendance_kind as enum ('clock_in','clock_out','break_start','break_end');
create type leave_status as enum ('pending','approved','rejected','cancelled');
create type claim_status as enum ('pending','approved','rejected','paid');
create type invite_status as enum ('pending','accepted','revoked','expired');
```

### 1. Profiles (1:1 with auth.users)

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,
  avatar_url   text,
  locale       text not null default 'id-ID',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: self read"  on profiles for select using (id = auth.uid());
create policy "profiles: self write" on profiles for update using (id = auth.uid());
-- insert handled by the handle_new_user trigger below
```

```sql
-- Auto-create a profile row whenever a new auth user is created
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### 2. Companies + membership (the multi-company core)

```sql
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique,
  legal_name    text,                       -- nullable while free
  industry      text,
  logo_url      text,
  timezone      text not null default 'Asia/Jakarta',
  locale        text not null default 'id-ID',
  plan          plan_tier not null default 'free',
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        company_role not null default 'employee',
  -- optional link to the employee record (when a member is also a paid employee)
  employee_id uuid,
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

create index on company_members(user_id);
create index on company_members(company_id);
```

#### Authorization helper functions (used by every policy)

`SECURITY DEFINER` so they can read `company_members` regardless of the caller's RLS. They are the single source of truth for "can this user touch this company".

```sql
-- Does the current user belong to the company at all?
create or replace function auth.user_has_company_access(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = target and user_id = auth.uid()
  );
$$;

-- Current user's role in a company (null if none).
create or replace function auth.user_role_in_company(target uuid)
returns company_role language sql stable security definer set search_path = public as $$
  select role from public.company_members
  where company_id = target and user_id = auth.uid();
$$;

-- Convenience: is the user an admin/owner of the company?
create or replace function auth.user_is_company_admin(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = target and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;
```

#### RLS for companies & members

```sql
alter table companies enable row level security;
alter table company_members enable row level security;

-- Companies: a user sees only companies they belong to.
create policy "companies: members read" on companies
  for select using (auth.user_has_company_access(id));

-- Update only by owner/admin.
create policy "companies: admin update" on companies
  for update using (auth.user_is_company_admin(id));

-- Creating a company is done via the SECURITY DEFINER provisioning function below
-- (so we can atomically insert the company + owner membership). Direct inserts blocked.

-- Delete only by owner.
create policy "companies: owner delete" on companies
  for delete using (auth.user_role_in_company(id) = 'owner');

-- Members: a user can read the membership rows of any company they belong to
-- (so admins can see the team; employees can see themselves).
create policy "members: company read" on company_members
  for select using (auth.user_has_company_access(company_id));

-- Only owner/admin can add/modify/remove members.
create policy "members: admin write" on company_members
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));
```

#### Atomic company provisioning (signup creates company + owner)

```sql
create or replace function public.create_company_with_owner(
  p_name text,
  p_industry text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into companies (name, industry, created_by)
  values (p_name, p_industry, auth.uid())
  returning id into v_company_id;

  insert into company_members (company_id, user_id, role)
  values (v_company_id, auth.uid(), 'owner');

  insert into company_settings (company_id) values (v_company_id);
  insert into company_billing  (company_id, plan) values (v_company_id, 'free');

  return v_company_id;
end; $$;
```

### 3. Company settings & billing (free-tier logic lives here)

```sql
create table company_settings (
  company_id        uuid primary key references companies(id) on delete cascade,
  payroll_cutoff_day smallint not null default 25,
  pay_date_day       smallint not null default 1,
  workweek_days      smallint not null default 5,   -- 5 or 6
  jkk_risk_class     text default 'very_low',        -- BPJS JKK risk tier
  default_currency   text not null default 'IDR',
  updated_at         timestamptz not null default now()
);

create table company_billing (
  company_id      uuid primary key references companies(id) on delete cascade,
  plan            plan_tier not null default 'free',
  -- Legal/tax fields: NULLABLE while free. Required only on upgrade / tax-affecting payroll.
  npwp            text,          -- company tax ID (NOT required on free tier)
  bpjs_kes_no     text,
  bpjs_tk_no      text,
  billing_email   text,
  free_seat_limit smallint not null default 5,
  active_seats    smallint not null default 0,
  trial_ends_at   timestamptz,
  updated_at      timestamptz not null default now()
);

alter table company_settings enable row level security;
alter table company_billing  enable row level security;

create policy "settings: member read" on company_settings
  for select using (auth.user_has_company_access(company_id));
create policy "settings: admin write" on company_settings
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));

create policy "billing: admin read"  on company_billing
  for select using (auth.user_is_company_admin(company_id));
create policy "billing: owner write" on company_billing
  for all using (auth.user_role_in_company(company_id) = 'owner')
  with check (auth.user_role_in_company(company_id) = 'owner');
```

#### Free-tier seat enforcement (first 5 employees free)

Enforced at the DB so the rule can't be bypassed from any client.

```sql
create or replace function public.enforce_free_seat_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan plan_tier;
  v_limit smallint;
  v_count int;
begin
  select b.plan, b.free_seat_limit into v_plan, v_limit
  from company_billing b where b.company_id = new.company_id;

  if v_plan = 'free' then
    select count(*) into v_count
    from employees e
    where e.company_id = new.company_id
      and e.status in ('active','probation');
    if v_count >= v_limit then
      raise exception 'FREE_SEAT_LIMIT_REACHED'
        using hint = 'Upgrade to add more than % employees', detail = v_limit::text;
    end if;
  end if;
  return new;
end; $$;

create trigger trg_free_seat_limit
  before insert on employees
  for each row execute function public.enforce_free_seat_limit();
```

### 4. Invitations (invite teammates / employees by email)

```sql
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  email       text not null,
  role        company_role not null default 'employee',
  token       text not null unique default encode(gen_random_bytes(24),'hex'),
  status      invite_status not null default 'pending',
  invited_by  uuid not null references auth.users(id),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);

alter table invitations enable row level security;

create policy "invites: admin manage" on invitations
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));
-- Acceptance is handled by a SECURITY DEFINER function that matches token + email.
```

### 5. Employees & related (tenant-scoped — RLS pattern repeats)

```sql
create table employees (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid references auth.users(id),  -- set when employee has a login
  employee_no   text,
  full_name     text not null,
  email         text,
  phone         text,
  status        employee_status not null default 'active',
  employment_type employment_type not null default 'permanent',
  join_date     date,
  end_date      date,
  department    text,
  position      text,
  manager_id    uuid references employees(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, employee_no)
);

create table compensation (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  base_salary   bigint not null default 0,          -- whole rupiah/month
  fixed_allowances jsonb not null default '[]',      -- [{name, amount}]
  pay_frequency text not null default 'monthly',
  -- BPJS / PPh participation toggles
  bpjs_kes_enrolled boolean not null default true,
  bpjs_tk_enrolled  boolean not null default true,
  jht_enrolled  boolean not null default true,
  jp_enrolled   boolean not null default true,
  effective_from date not null default current_date,
  created_at    timestamptz not null default now()
);

create table tax_profile (
  employee_id   uuid primary key references employees(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  ptkp_status   text not null default 'TK/0',   -- TK/0..TK/3, K/0..K/3
  npwp          text,                            -- employee NPWP (affects PPh 21)
  has_npwp      boolean not null default false
);

create table bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  bank_name    text,
  account_no   text,
  account_name text,
  is_primary   boolean not null default true
);

-- Apply the standard tenant RLS to each of these tables:
do $$
declare t text;
begin
  foreach t in array array['employees','compensation','tax_profile','bank_accounts'] loop
    execute format('alter table %I enable row level security;', t);
    -- read: any member of the company
    execute format($f$create policy "%1$s: member read" on %1$s
      for select using (auth.user_has_company_access(company_id));$f$, t);
    -- write: owner/admin
    execute format($f$create policy "%1$s: admin write" on %1$s
      for all using (auth.user_is_company_admin(company_id))
      with check (auth.user_is_company_admin(company_id));$f$, t);
  end loop;
end $$;
```

> **Employee self-access nuance:** an `employee`-role member should read *their own* employee row even though they aren't admin. Add a narrower policy where `employees.user_id = auth.uid()` (and similar own-row policies on `compensation`/`bank_accounts`/payslips). Example:

```sql
create policy "employees: self read" on employees
  for select using (user_id = auth.uid());
```

### 6. Attendance, schedules, leave, claims (Stages 3 & 5)

```sql
create table attendance_records (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  kind         attendance_kind not null,
  event_at     timestamptz not null default now(),
  latitude     double precision,
  longitude    double precision,
  selfie_url   text,                 -- Supabase Storage / GCS path (liveness check)
  is_valid     boolean not null default true,
  note         text
);

create table leave_types (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,         -- Cuti Tahunan, Sakit, Melahirkan, etc.
  paid        boolean not null default true,
  default_days smallint not null default 12
);

create table leave_requests (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type_id uuid references leave_types(id),
  start_date  date not null,
  end_date    date not null,
  reason      text,
  status      leave_status not null default 'pending',
  approver_id uuid references employees(id),
  created_at  timestamptz not null default now()
);

create table reimbursement_claims (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  category    text,
  amount      bigint not null,
  receipt_url text,
  status      claim_status not null default 'pending',
  approver_id uuid references employees(id),
  created_at  timestamptz not null default now()
);
-- Apply the same tenant RLS pattern (member read / admin write) plus
-- employee self-insert & self-read policies for their own records.
```

### 7. Payroll (Stage 4) — reproducible runs

```sql
create table payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  period_year   smallint not null,
  period_month  smallint not null,
  status        pay_period_status not null default 'draft',
  -- snapshot of the config used, so old runs never change when the law changes
  config_snapshot jsonb,
  total_gross   bigint default 0,
  total_net     bigint default 0,
  total_pph21   bigint default 0,
  total_bpjs_employee bigint default 0,
  total_bpjs_employer bigint default 0,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (company_id, period_year, period_month)
);

create table payroll_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id   uuid not null references employees(id),
  gross_pay     bigint not null default 0,
  base_salary   bigint not null default 0,
  allowances    bigint not null default 0,
  overtime_pay  bigint not null default 0,
  -- BPJS
  bpjs_kes_employee bigint not null default 0,
  bpjs_kes_employer bigint not null default 0,
  jht_employee  bigint not null default 0,
  jht_employer  bigint not null default 0,
  jp_employee   bigint not null default 0,
  jp_employer   bigint not null default 0,
  jkk_employer  bigint not null default 0,
  jkm_employer  bigint not null default 0,
  -- tax
  pph21         bigint not null default 0,
  ter_category  text,
  ter_rate_bps  int,            -- effective rate in basis points (snapshot)
  -- result
  net_pay       bigint not null default 0,
  breakdown     jsonb,          -- full itemized explanation for the payslip
  created_at    timestamptz not null default now()
);

create table payslips (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  payroll_item_id uuid not null references payroll_items(id) on delete cascade,
  employee_id   uuid not null references employees(id),
  pdf_path      text,           -- Cloud Storage object path
  issued_at     timestamptz not null default now()
);
-- RLS: member read scoped by company_id; employee self-read where the
-- payslip's employee.user_id = auth.uid(); writes only by service role / admin.
```

### 8. Reference tables (global, versioned — see 05-indonesian-compliance.md)

```sql
-- Not tenant-scoped. RLS allows read to all authenticated users; writes only service role.
create table ptkp_rates (
  id uuid primary key default gen_random_uuid(),
  status text not null,            -- TK/0, K/1, ...
  annual_amount bigint not null,   -- rupiah/year
  effective_from date not null,
  effective_to   date
);

create table tax_brackets (
  id uuid primary key default gen_random_uuid(),
  lower_bound bigint not null,     -- annual PKP lower bound (rupiah)
  upper_bound bigint,              -- null = no upper bound
  rate_bps int not null,           -- e.g. 500 = 5%
  effective_from date not null,
  effective_to date
);

create table ter_rates (
  id uuid primary key default gen_random_uuid(),
  category text not null,          -- TER A / B / C
  income_lower bigint not null,
  income_upper bigint,
  rate_bps int not null,
  effective_from date not null,
  effective_to date
);

create table bpjs_config (
  id uuid primary key default gen_random_uuid(),
  key text not null,               -- jht_employee, jp_employer, kes_cap, jp_cap, jkk_very_low...
  rate_bps int,                    -- for percentage values
  amount bigint,                   -- for caps (rupiah)
  effective_from date not null,
  effective_to date
);

alter table ptkp_rates  enable row level security;
alter table tax_brackets enable row level security;
alter table ter_rates    enable row level security;
alter table bpjs_config  enable row level security;

-- authenticated users may read reference data
create policy "ref read ptkp"   on ptkp_rates   for select using (auth.role() = 'authenticated');
create policy "ref read brackets" on tax_brackets for select using (auth.role() = 'authenticated');
create policy "ref read ter"    on ter_rates    for select using (auth.role() = 'authenticated');
create policy "ref read bpjs"   on bpjs_config  for select using (auth.role() = 'authenticated');
-- (no insert/update/delete policy ⇒ only service role can write)
```

### 9. Audit log

```sql
create table audit_logs (
  id          bigserial primary key,
  company_id  uuid references companies(id) on delete cascade,
  actor_id    uuid references auth.users(id),
  action      text not null,
  entity      text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
alter table audit_logs enable row level security;
create policy "audit: admin read" on audit_logs
  for select using (company_id is not null and auth.user_is_company_admin(company_id));
-- inserts only via service role / SECURITY DEFINER triggers
```

---

## RLS testing (do not skip)

Write **pgTAP** tests under `supabase/tests/` that prove, for two companies A and B and a user who is `owner` of A and `employee` of B:

1. User can read/write A's employees.
2. User can read **only their own** employee row in B; cannot read others.
3. User cannot read A's data when authenticated as a third user with no membership.
4. Free-seat trigger blocks the 6th active employee on a `free` company and allows it after upgrade.
5. A non-owner cannot update `company_billing`.

These tests are part of Stage 1/2 acceptance criteria.

## Type generation

After every migration: `supabase gen types typescript --local > packages/types/src/database.ts` and commit. Domain code imports `Database` from `@nexis/types`.
