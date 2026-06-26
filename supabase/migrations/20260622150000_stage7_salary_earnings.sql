-- Nexis — Stage 7 Migration: Salary Earnings, Allowances, schedules, and manual deductions
-- Date: 2026-06-22

-- ── 1. Alter compensation and company_settings ──────────────────────────────

-- Widen pay_frequency check constraint on compensation
alter table public.compensation
  drop constraint if exists compensation_pay_frequency_check;

alter table public.compensation
  add constraint compensation_pay_frequency_check
  check (pay_frequency in ('monthly', 'daily', 'mixed'));

-- Add daily_rate column to compensation (integer rupiah)
alter table public.compensation
  add column if not exists daily_rate bigint not null default 0;

-- Add work_days column to compensation (weekly schedule array)
alter table public.compensation
  add column if not exists work_days int[] null,
  add constraint compensation_work_days_check
  check (work_days <@ array[1,2,3,4,5,6,7]);

-- Add work_days column to company_settings (weekly schedule array)
alter table public.company_settings
  add column if not exists work_days int[] not null default '{1,2,3,4,5}',
  add constraint company_settings_work_days_check
  check (work_days <@ array[1,2,3,4,5,6,7]);

-- ── 2. Create custom_earning_types table ────────────────────────────────────
create table public.custom_earning_types (
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

-- ── 3. Create earning_groups table ──────────────────────────────────────────
create table public.earning_groups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index on public.earning_groups(company_id);

-- ── 4. Create earning_group_items table ──────────────────────────────────────
create table public.earning_group_items (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  group_id       uuid not null references public.earning_groups(id) on delete cascade,
  custom_type_id uuid not null references public.custom_earning_types(id) on delete cascade,
  unique (group_id, custom_type_id)
);

create index on public.earning_group_items(company_id);
create index on public.earning_group_items(group_id);
create index on public.earning_group_items(custom_type_id);

-- ── 5. Create employee_earning_group table ────────────────────────────────────
create table public.employee_earning_group (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  group_id    uuid not null references public.earning_groups(id) on delete cascade
);

create index on public.employee_earning_group(company_id);
create index on public.employee_earning_group(group_id);

-- ── 6. Create employee_earning table ─────────────────────────────────────────
create table public.employee_earning (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  custom_type_id  uuid not null references public.custom_earning_types(id) on delete cascade,
  amount_override bigint check (amount_override >= 0),
  enabled         boolean not null default true,
  unique (employee_id, custom_type_id)
);

create index on public.employee_earning(company_id);
create index on public.employee_earning(employee_id);
create index on public.employee_earning(custom_type_id);

-- ── 7. Create employee_manual_deduction table ────────────────────────────────
create table public.employee_manual_deduction (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount      bigint not null check (amount > 0),
  reason      text not null,
  date        date,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on public.employee_manual_deduction(company_id);
create index on public.employee_manual_deduction(employee_id);

-- ── 8. Create payroll_item_earnings table ─────────────────────────────────────
create table public.payroll_item_earnings (
  id              uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  custom_type_id  uuid references public.custom_earning_types(id) on delete set null,
  label           text not null,
  amount          bigint not null,
  taxable         boolean not null default true
);

create index on public.payroll_item_earnings(payroll_item_id);
create index on public.payroll_item_earnings(custom_type_id);

-- ── 9. Enable Row Level Security (RLS) ───────────────────────────────────────
alter table public.custom_earning_types enable row level security;
alter table public.earning_groups enable row level security;
alter table public.earning_group_items enable row level security;
alter table public.employee_earning_group enable row level security;
alter table public.employee_earning enable row level security;
alter table public.employee_manual_deduction enable row level security;
alter table public.payroll_item_earnings enable row level security;

-- ── 10. RLS Policies ─────────────────────────────────────────────────────────

-- custom_earning_types
create policy "custom_earning_types: select" on public.custom_earning_types
  for select using (public.user_has_company_access(company_id));

create policy "custom_earning_types: admin modify" on public.custom_earning_types
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- earning_groups
create policy "earning_groups: select" on public.earning_groups
  for select using (public.user_has_company_access(company_id));

create policy "earning_groups: admin modify" on public.earning_groups
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- earning_group_items
create policy "earning_group_items: select" on public.earning_group_items
  for select using (public.user_has_company_access(company_id));

create policy "earning_group_items: admin modify" on public.earning_group_items
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- employee_earning_group
create policy "employee_earning_group: select" on public.employee_earning_group
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (select id from public.employees where user_id = auth.uid())
  );

create policy "employee_earning_group: admin modify" on public.employee_earning_group
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- employee_earning
create policy "employee_earning: select" on public.employee_earning
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (select id from public.employees where user_id = auth.uid())
  );

create policy "employee_earning: admin modify" on public.employee_earning
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- employee_manual_deduction
create policy "employee_manual_deduction: select" on public.employee_manual_deduction
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (select id from public.employees where user_id = auth.uid())
  );

create policy "employee_manual_deduction: admin modify" on public.employee_manual_deduction
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- payroll_item_earnings
create policy "payroll_item_earnings: select" on public.payroll_item_earnings
  for select using (
    exists (
      select 1 from public.payroll_items pi
      where pi.id = payroll_item_id
        and (
          public.user_is_company_admin(pi.company_id)
          or pi.employee_id in (select id from public.employees where user_id = auth.uid())
        )
    )
  );

create policy "payroll_item_earnings: admin modify" on public.payroll_item_earnings
  for all using (
    exists (
      select 1 from public.payroll_items pi
      where pi.id = payroll_item_id and public.user_is_company_admin(pi.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.payroll_items pi
      where pi.id = payroll_item_id and public.user_is_company_admin(pi.company_id)
    )
  );

-- ── 11. Realtime Publication Settings ───────────────────────────────────────
alter publication supabase_realtime add table public.custom_earning_types;
alter publication supabase_realtime add table public.earning_groups;
alter publication supabase_realtime add table public.earning_group_items;
alter publication supabase_realtime add table public.employee_earning_group;
alter publication supabase_realtime add table public.employee_earning;
alter publication supabase_realtime add table public.employee_manual_deduction;
