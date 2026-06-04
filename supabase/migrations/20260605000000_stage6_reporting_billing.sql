-- ============================================================================
-- Nexis — Stage 6 Migration: Reporting, Exports & Subscription Billing
-- ============================================================================

-- ── 1. Subscriptions Table ───────────────────────────────────────────────────

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  status                  text not null check (status in ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  plan_id                 text not null,
  quantity                integer not null default 1 check (quantity >= 0),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  gateway_subscription_id text unique,
  gateway_customer_id     text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index on public.subscriptions(company_id);

-- ── 2. Invoices Table ─────────────────────────────────────────────────────────

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  subscription_id     uuid references public.subscriptions(id) on delete set null,
  amount              bigint not null check (amount >= 0),
  status              text not null check (status in ('paid', 'open', 'uncollectible', 'void')),
  period_start        timestamptz,
  period_end          timestamptz,
  pdf_url             text,
  gateway_invoice_id  text unique,
  created_at          timestamptz not null default now()
);
create index on public.invoices(company_id);
create index on public.invoices(subscription_id);

-- ── 3. Report Jobs Table ──────────────────────────────────────────────────────

create table public.report_jobs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  report_type    text not null check (report_type in ('payroll_summary', 'bpjs_contribution', 'pph21_ebupot', 'bpjs_sipp')),
  status         text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  parameters     jsonb not null default '{}'::jsonb,
  output_path    text,
  error_message  text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index on public.report_jobs(company_id);

-- ── 4. Add subscription_id to company_billing ─────────────────────────────────

alter table public.company_billing 
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

-- ── 5. Enable Row Level Security (RLS) ──────────────────────────────────────

alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.report_jobs enable row level security;

-- ── 6. Define RLS Policies ──────────────────────────────────────────────────

-- subscriptions (Only owners/admins can select, writes restricted to service role)
create policy "subscriptions: select admin" on public.subscriptions
  for select using (public.user_is_company_admin(company_id));

-- invoices (Only owners/admins can select, writes restricted to service role)
create policy "invoices: select admin" on public.invoices
  for select using (public.user_is_company_admin(company_id));

-- report_jobs (Owners, admins, managers can see, create, and manage export jobs)
create policy "report_jobs: select member" on public.report_jobs
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));

create policy "report_jobs: insert member" on public.report_jobs
  for insert with check (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    and (created_by is null or created_by = auth.uid())
  );

create policy "report_jobs: update member" on public.report_jobs
  for update using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
  )
  with check (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
  );

-- ── 7. Configure Reports Storage Bucket & Policies ──────────────────────────

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "reports_bucket: select admin" on storage.objects
  for select using (
    bucket_id = 'reports'
    and public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
  );

create policy "reports_bucket: admin write" on storage.objects
  for all using (
    bucket_id = 'reports'
    and public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
  );
