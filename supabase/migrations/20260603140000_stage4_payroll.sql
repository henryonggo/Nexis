-- ============================================================================
-- Nexis — Stage 4 migration: Payroll Engine Tables, RLS, and Seeding Setup
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type pay_period_status as enum ('draft', 'queued', 'processing', 'completed', 'failed', 'paid', 'cancelled');

-- ── 1. Reference Tables (Global, versioned, read-only to authenticated) ─────

create table ptkp_rates (
  id             uuid primary key default gen_random_uuid(),
  status         text not null,            -- TK/0, K/1, etc.
  annual_amount  bigint not null check (annual_amount >= 0),
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_from <= effective_to)
);
create index on ptkp_rates(status, effective_from);

create table tax_brackets (
  id             uuid primary key default gen_random_uuid(),
  lower_bound    bigint not null check (lower_bound >= 0),
  upper_bound    bigint check (upper_bound is null or upper_bound >= lower_bound),
  rate_bps       integer not null check (rate_bps >= 0),
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_from <= effective_to)
);
create index on tax_brackets(lower_bound, effective_from);

create table ter_rates (
  id             uuid primary key default gen_random_uuid(),
  category       text not null,            -- 'A', 'B', 'C'
  income_lower   bigint not null check (income_lower >= 0),
  income_upper   bigint check (income_upper is null or income_upper >= income_lower),
  rate_bps       integer not null check (rate_bps >= 0),
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_from <= effective_to)
);
create index on ter_rates(category, income_lower, effective_from);

create table bpjs_config (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,            -- jht_employee, jp_employer, etc.
  rate_bps       integer check (rate_bps >= 0),
  amount         bigint check (amount >= 0),
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_from <= effective_to)
);
create index on bpjs_config(key, effective_from);

-- ── 2. Payroll Tables (Tenant-scoped) ────────────────────────────────────────

create table payroll_runs (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  period_year          smallint not null check (period_year >= 2000),
  period_month         smallint not null check (period_month >= 1 and period_month <= 12),
  status               pay_period_status not null default 'draft',
  config_snapshot      jsonb,              -- rates/limits used, for reproducibility
  total_gross          bigint not null default 0 check (total_gross >= 0),
  total_net            bigint not null default 0 check (total_net >= 0),
  total_pph21          bigint not null default 0 check (total_pph21 >= 0),
  total_bpjs_employee  bigint not null default 0 check (total_bpjs_employee >= 0),
  total_bpjs_employer  bigint not null default 0 check (total_bpjs_employer >= 0),
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz,
  unique (company_id, period_year, period_month)
);
create index on payroll_runs(company_id);

create table payroll_items (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  payroll_run_id      uuid not null references payroll_runs(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete cascade,
  gross_pay           bigint not null default 0 check (gross_pay >= 0),
  base_salary         bigint not null default 0 check (base_salary >= 0),
  allowances          bigint not null default 0 check (allowances >= 0),
  overtime_pay        bigint not null default 0 check (overtime_pay >= 0),
  -- BPJS
  bpjs_kes_employee   bigint not null default 0 check (bpjs_kes_employee >= 0),
  bpjs_kes_employer   bigint not null default 0 check (bpjs_kes_employer >= 0),
  jht_employee        bigint not null default 0 check (jht_employee >= 0),
  jht_employer        bigint not null default 0 check (jht_employer >= 0),
  jp_employee         bigint not null default 0 check (jp_employee >= 0),
  jp_employer         bigint not null default 0 check (jp_employer >= 0),
  jkk_employer        bigint not null default 0 check (jkk_employer >= 0),
  jkm_employer        bigint not null default 0 check (jkm_employer >= 0),
  -- Tax
  pph21               bigint not null default 0 check (pph21 >= 0),
  ter_category        text check (ter_category in ('A', 'B', 'C')),
  ter_rate_bps        integer check (ter_rate_bps >= 0),
  -- Result
  net_pay             bigint not null default 0 check (net_pay >= 0),
  breakdown           jsonb,              -- itemized calculation details
  created_at          timestamptz not null default now()
);
create index on payroll_items(company_id);
create index on payroll_items(payroll_run_id);
create index on payroll_items(employee_id);

create table payslips (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  payroll_item_id uuid not null references payroll_items(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  pdf_path        text,               -- pointer in GCS/Supabase Storage
  issued_at       timestamptz not null default now()
);
create index on payslips(company_id);
create index on payslips(payroll_item_id);
create index on payslips(employee_id);

-- ── 3. Row Level Security (RLS) policies ────────────────────────────────────────

alter table ptkp_rates enable row level security;
alter table tax_brackets enable row level security;
alter table ter_rates enable row level security;
alter table bpjs_config enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_items enable row level security;
alter table payslips enable row level security;

-- Reference data (Read-only for all authenticated users)
create policy "ptkp_rates: select" on ptkp_rates for select using (auth.role() = 'authenticated');
create policy "tax_brackets: select" on tax_brackets for select using (auth.role() = 'authenticated');
create policy "ter_rates: select" on ter_rates for select using (auth.role() = 'authenticated');
create policy "bpjs_config: select" on bpjs_config for select using (auth.role() = 'authenticated');

-- payroll_runs (Admins manage; no employee access)
create policy "payroll_runs: select" on payroll_runs
  for select using (public.user_has_company_access(company_id));
create policy "payroll_runs: admin modify" on payroll_runs
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- payroll_items (Admins manage; employees read their own)
create policy "payroll_items: select" on payroll_items
  for select using (
    public.user_is_company_admin(company_id)
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "payroll_items: admin modify" on payroll_items
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- payslips (Admins manage; employees read their own)
create policy "payslips: select" on payslips
  for select using (
    public.user_is_company_admin(company_id)
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "payslips: admin modify" on payslips
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- ── 4. Storage Bucket Configuration for Payslips ─────────────────────────────

insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do nothing;

create policy "payslips_bucket: select" on storage.objects
  for select using (
    bucket_id = 'payslips'
    and (
      public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
      or exists (
        select 1 from public.employees
        where id = cast(split_part(name, '/', 2) as uuid)
          and user_id = auth.uid()
      )
    )
  );

create policy "payslips_bucket: admin write" on storage.objects
  for all using (
    bucket_id = 'payslips'
    and public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
  );
