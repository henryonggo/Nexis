-- ============================================================================
-- Nexis — Configurable salary earnings & deductions, weekly work schedule,
-- mixed/daily pay, and manual (absence) deductions.
--
-- Lands the app-layer features shipped in PRs #40/#42/#44 that were built against
-- agreed shapes behind a quarantined client cast. Purely ADDITIVE: new tables,
-- new nullable/defaulted columns, and one widened CHECK constraint — no existing
-- table is dropped or restructured, and existing rows stay valid.
--
-- RLS mirrors the compensation/employee pattern (stage 2): owner/admin write via
-- public.user_is_company_admin(company_id); admins read; the owning employee reads
-- their own per-employee rows. The payroll worker uses the service role (bypasses
-- RLS).
-- ============================================================================

-- ── 1. Compensation & company_settings columns ──────────────────────────────

-- Daily rate (the second box of the "mixed" salary model) and per-employee weekly
-- schedule (ISO weekdays 1=Mon…7=Sun; null = follow the company default).
alter table public.compensation
  add column if not exists daily_rate bigint not null default 0 check (daily_rate >= 0),
  add column if not exists work_days int[],
  add column if not exists pph21_enrolled boolean not null default true;

-- Company default weekly schedule (Mon–Fri).
alter table public.company_settings
  add column if not exists work_days int[] not null default '{1,2,3,4,5}';

-- Widen pay_frequency to allow "mixed" (was monthly/daily — see
-- 20260619100000_daily_payroll_support.sql).
alter table public.compensation
  drop constraint if exists compensation_pay_frequency_check;
alter table public.compensation
  add constraint compensation_pay_frequency_check
  check (pay_frequency in ('monthly', 'daily', 'mixed'));

-- ── 2. Custom deduction types + groups (PR #40) ─────────────────────────────

create table if not exists public.custom_deduction_types (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  calc        text not null check (calc in ('fixed', 'percent')),
  amount      bigint check (amount >= 0),
  rate_bps    int check (rate_bps between 0 and 10000),
  base        text check (base in ('gross', 'base_salary')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.custom_deduction_types(company_id);

create table if not exists public.deduction_groups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.deduction_groups(company_id);

create table if not exists public.deduction_group_items (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  group_id        uuid not null references public.deduction_groups(id) on delete cascade,
  statutory_code  text check (statutory_code in ('bpjs_kes', 'jht', 'jp', 'pph21')),
  custom_type_id  uuid references public.custom_deduction_types(id) on delete cascade,
  check (num_nonnulls(statutory_code, custom_type_id) = 1)
);
create index on public.deduction_group_items(company_id);
create index on public.deduction_group_items(group_id);

create table if not exists public.employee_deduction_group (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  group_id    uuid not null references public.deduction_groups(id) on delete cascade
);
create index on public.employee_deduction_group(company_id);
create index on public.employee_deduction_group(group_id);

create table if not exists public.employee_deduction (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  statutory_code  text check (statutory_code in ('bpjs_kes', 'jht', 'jp', 'pph21')),
  custom_type_id  uuid references public.custom_deduction_types(id) on delete cascade,
  enabled         boolean not null default true,
  check (num_nonnulls(statutory_code, custom_type_id) = 1)
);
create index on public.employee_deduction(company_id);
create index on public.employee_deduction(employee_id);

-- ── 3. Custom earning types (allowances) + groups (PR #42) ───────────────────

create table if not exists public.custom_earning_types (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  calc        text not null check (calc in ('fixed', 'percent')),
  amount      bigint check (amount >= 0),
  rate_bps    int check (rate_bps between 0 and 10000),
  base        text check (base in ('gross', 'base_salary')),
  taxable     boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.custom_earning_types(company_id);

create table if not exists public.earning_groups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.earning_groups(company_id);

create table if not exists public.earning_group_items (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  group_id        uuid not null references public.earning_groups(id) on delete cascade,
  custom_type_id  uuid not null references public.custom_earning_types(id) on delete cascade
);
create index on public.earning_group_items(company_id);
create index on public.earning_group_items(group_id);

create table if not exists public.employee_earning_group (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  group_id    uuid not null references public.earning_groups(id) on delete cascade
);
create index on public.employee_earning_group(company_id);
create index on public.employee_earning_group(group_id);

create table if not exists public.employee_earning (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  custom_type_id  uuid not null references public.custom_earning_types(id) on delete cascade,
  amount_override bigint check (amount_override >= 0),
  enabled         boolean not null default true
);
create index on public.employee_earning(company_id);
create index on public.employee_earning(employee_id);

-- ── 4. Manual / absence deductions (PR #44) ──────────────────────────────────

create table if not exists public.employee_manual_deduction (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount      bigint not null check (amount > 0),
  reason      text not null,
  date        date,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.employee_manual_deduction(company_id);
create index on public.employee_manual_deduction(employee_id);
create index on public.employee_manual_deduction(date);

-- ── 5. Row Level Security ────────────────────────────────────────────────────

alter table public.custom_deduction_types    enable row level security;
alter table public.deduction_groups          enable row level security;
alter table public.deduction_group_items     enable row level security;
alter table public.employee_deduction_group  enable row level security;
alter table public.employee_deduction        enable row level security;
alter table public.custom_earning_types      enable row level security;
alter table public.earning_groups            enable row level security;
alter table public.earning_group_items       enable row level security;
alter table public.employee_earning_group    enable row level security;
alter table public.employee_earning          enable row level security;
alter table public.employee_manual_deduction enable row level security;

-- Company-level config tables: admin read + admin write.
do $$
declare t text;
begin
  foreach t in array array[
    'custom_deduction_types', 'deduction_groups', 'deduction_group_items',
    'custom_earning_types', 'earning_groups', 'earning_group_items'
  ]
  loop
    execute format(
      'create policy "%1$s: admin read" on public.%1$s for select using (public.user_is_company_admin(company_id));',
      t);
    execute format(
      'create policy "%1$s: admin write" on public.%1$s for all using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));',
      t);
  end loop;
end $$;

-- Per-employee tables: admin read + admin write + the owning employee reads self.
do $$
declare t text;
begin
  foreach t in array array[
    'employee_deduction_group', 'employee_deduction',
    'employee_earning_group', 'employee_earning', 'employee_manual_deduction'
  ]
  loop
    execute format(
      'create policy "%1$s: admin read" on public.%1$s for select using (public.user_is_company_admin(company_id));',
      t);
    execute format(
      'create policy "%1$s: self read" on public.%1$s for select using (employee_id in (select id from public.employees where user_id = auth.uid()));',
      t);
    execute format(
      'create policy "%1$s: admin write" on public.%1$s for all using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));',
      t);
  end loop;
end $$;
