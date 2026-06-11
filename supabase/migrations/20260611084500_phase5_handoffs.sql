-- ============================================================================
-- Nexis — Phase 5 and Stage 7 Tracks Handoff Migration
-- ============================================================================

-- Ensure pgcrypto extension is active for SCIM token digest/generation
create extension if not exists pgcrypto with schema extensions;

-- ── 1. WhatsApp Notifications ───────────────────────────────────────────────
alter table public.profiles add column if not exists whatsapp_opt_in boolean not null default false;

-- ── 2. Billing Payment Gateway ──────────────────────────────────────────────
alter table public.subscriptions add column if not exists plan plan_tier;
alter table public.company_billing add column if not exists pending_plan plan_tier;

drop policy if exists "subscriptions: select admin" on public.subscriptions;
create policy "subscriptions: select admin" on public.subscriptions
  for select using (public.user_is_company_admin(company_id));

-- ── 3. Recruitment / ATS ────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_opening_status') then
    create type job_opening_status as enum ('open', 'paused', 'closed', 'filled');
  end if;
  if not exists (select 1 from pg_type where typname = 'application_stage') then
    create type application_stage as enum ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'interview_outcome') then
    create type interview_outcome as enum ('pending', 'pass', 'fail');
  end if;
end $$;

create table if not exists public.job_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  department text,
  employment_type employment_type not null default 'permanent',
  description text,
  status job_opening_status not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_openings_company_idx on public.job_openings(company_id);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  resume_path text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists candidates_company_idx on public.candidates(company_id);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_opening_id uuid not null references public.job_openings(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  stage application_stage not null default 'applied',
  rating smallint check (rating >= 1 and rating <= 5),
  notes text,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_opening_id, candidate_id)
);
create index if not exists applications_company_idx on public.applications(company_id);
create index if not exists applications_job_opening_idx on public.applications(job_opening_id);
create index if not exists applications_candidate_idx on public.applications(candidate_id);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  interviewer_id uuid references public.employees(id) on delete set null,
  mode text check (mode in ('onsite', 'video', 'phone')),
  feedback text,
  outcome interview_outcome not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interviews_company_idx on public.interviews(company_id);
create index if not exists interviews_application_idx on public.interviews(application_id);

alter table public.job_openings enable row level security;
alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;

-- RLS: any company member can read recruitment details
create policy "job_openings: select" on public.job_openings
  for select using (public.user_has_company_access(company_id));
create policy "candidates: select" on public.candidates
  for select using (public.user_has_company_access(company_id));
create policy "applications: select" on public.applications
  for select using (public.user_has_company_access(company_id));
create policy "interviews: select" on public.interviews
  for select using (public.user_has_company_access(company_id));

-- RLS: only owner, admin, manager can manage recruitment details
create policy "job_openings: write" on public.job_openings
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));
create policy "candidates: write" on public.candidates
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));
create policy "applications: write" on public.applications
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));
create policy "interviews: write" on public.interviews
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));

-- resumes private storage bucket
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "resumes_bucket: select" on storage.objects
  for select using (
    bucket_id = 'resumes'
    and public.user_has_company_access(cast(split_part(name, '/', 1) as uuid))
  );

create policy "resumes_bucket: write" on storage.objects
  for all using (
    bucket_id = 'resumes'
    and public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager')
  );

-- hire_application RPC function
create or replace function public.hire_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_cand public.candidates%rowtype;
  v_job public.job_openings%rowtype;
  v_emp_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  if not public.user_role_in_company(v_app.company_id) in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to hire candidates for this company';
  end if;

  select * into v_cand from public.candidates where id = v_app.candidate_id;
  if not found then
    raise exception 'Candidate not found';
  end if;

  select * into v_job from public.job_openings where id = v_app.job_opening_id;
  if not found then
    raise exception 'Job opening not found';
  end if;

  update public.applications
  set stage = 'hired',
      updated_at = now()
  where id = p_application_id;

  update public.job_openings
  set status = 'filled',
      updated_at = now()
  where id = v_app.job_opening_id;

  insert into public.employees (
    company_id,
    full_name,
    email,
    phone,
    status,
    employment_type,
    join_date
  ) values (
    v_app.company_id,
    v_cand.full_name,
    v_cand.email,
    v_cand.phone,
    'probation',
    v_job.employment_type,
    current_date
  ) returning id into v_emp_id;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_app.company_id,
    auth.uid(),
    'hire_application',
    'applications',
    p_application_id,
    jsonb_build_object('employee_id', v_emp_id, 'candidate_id', v_cand.id, 'job_opening_id', v_job.id)
  );

  return v_emp_id;
end;
$$;

grant execute on function public.hire_application(uuid) to authenticated;

-- ── 4. Multi-currency / Expat ───────────────────────────────────────────────
create table if not exists public.currencies (
  code text primary key check (length(code) = 3),
  symbol text not null,
  decimals integer not null default 2 check (decimals >= 0),
  created_at timestamptz not null default now()
);

insert into public.currencies (code, symbol, decimals) values
  ('IDR', 'Rp', 0),
  ('USD', '$', 2),
  ('SGD', 'S$', 2),
  ('EUR', '€', 2),
  ('GBP', '£', 2),
  ('JPY', '¥', 0)
on conflict (code) do nothing;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null references public.currencies(code) default 'IDR',
  quote text not null references public.currencies(code),
  rate numeric(18, 9) not null check (rate > 0),
  effective_from timestamptz not null default now(),
  source text,
  created_at timestamptz not null default now()
);
create index if not exists exchange_rates_quote_base_effective_idx on public.exchange_rates(quote, base, effective_from);

insert into public.exchange_rates (base, quote, rate, effective_from, source) values
  ('IDR', 'USD', 16300.000000000, '2026-01-01 00:00:00+00', 'Seed Rates'),
  ('IDR', 'SGD', 12100.000000000, '2026-01-01 00:00:00+00', 'Seed Rates'),
  ('IDR', 'EUR', 17500.000000000, '2026-01-01 00:00:00+00', 'Seed Rates'),
  ('IDR', 'GBP', 20800.000000000, '2026-01-01 00:00:00+00', 'Seed Rates'),
  ('IDR', 'JPY', 104.000000000, '2026-01-01 00:00:00+00', 'Seed Rates')
on conflict do nothing;

alter table public.currencies enable row level security;
alter table public.exchange_rates enable row level security;

create policy "currencies: select" on public.currencies
  for select using (auth.role() = 'authenticated');
create policy "exchange_rates: select" on public.exchange_rates
  for select using (auth.role() = 'authenticated');

alter table public.compensation add column if not exists currency text not null references public.currencies(code) default 'IDR';
alter table public.payroll_items add column if not exists currency text not null references public.currencies(code) default 'IDR';

-- ── 5. SSO / SCIM (Enterprise) ──────────────────────────────────────────────
create table if not exists public.company_sso (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('saml', 'oidc')),
  idp_metadata text,
  domain text not null unique,
  enabled boolean not null default true,
  default_role company_role not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_sso_company_idx on public.company_sso(company_id);

alter table public.company_sso enable row level security;

create policy "company_sso: select admin" on public.company_sso
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_sso: write owner" on public.company_sso
  for all using (public.user_role_in_company(company_id) = 'owner')
  with check (public.user_role_in_company(company_id) = 'owner');

create table if not exists public.company_scim_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  token_hash text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_scim_tokens_company_idx on public.company_scim_tokens(company_id);
create index if not exists company_scim_tokens_hash_idx on public.company_scim_tokens(token_hash);

alter table public.company_scim_tokens enable row level security;

create policy "company_scim_tokens: select admin" on public.company_scim_tokens
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_scim_tokens: write admin" on public.company_scim_tokens
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin'));

-- SCIM token generator RPC
create or replace function public.generate_scim_token(
  p_company_id uuid,
  p_expires_at timestamptz default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_raw_token text;
  v_hashed_token text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if public.user_role_in_company(p_company_id) is null or public.user_role_in_company(p_company_id) not in ('owner', 'admin') then
    raise exception 'Unauthorized to generate SCIM tokens for this company';
  end if;

  v_raw_token := 'nexis_scim_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_hashed_token := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  insert into public.company_scim_tokens (
    company_id,
    token_hash,
    created_by,
    expires_at
  )
  values (
    p_company_id,
    v_hashed_token,
    auth.uid(),
    p_expires_at
  );

  return v_raw_token;
end;
$$;

grant execute on function public.generate_scim_token(uuid, timestamptz) to authenticated;

-- SCIM bridge user query helper RPCs
create or replace function public.get_scim_users(p_company_id uuid, p_email text default null)
returns table (
  id uuid,
  email varchar(255),
  full_name text,
  role company_role,
  deactivated_at timestamptz
) language plpgsql security definer set search_path = public, auth as $$
begin
  return query
  select u.id, u.email, p.full_name, m.role, p.deactivated_at
  from public.company_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.company_id = p_company_id
    and (p_email is null or lower(u.email) = lower(p_email));
end; $$;

create or replace function public.get_scim_user_by_id(p_company_id uuid, p_user_id uuid)
returns table (
  id uuid,
  email varchar(255),
  full_name text,
  role company_role,
  deactivated_at timestamptz
) language plpgsql security definer set search_path = public, auth as $$
begin
  return query
  select u.id, u.email, p.full_name, m.role, p.deactivated_at
  from public.company_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.company_id = p_company_id and m.user_id = p_user_id;
end; $$;

create or replace function public.scim_set_user_active(
  p_company_id uuid,
  p_user_id uuid,
  p_active boolean
)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = p_user_id
  ) then
    raise exception 'User not found in company';
  end if;

  if p_active then
    update public.profiles
    set deactivated_at = null
    where id = p_user_id;

    update auth.users
    set banned_until = null
    where id = p_user_id;
  else
    update public.profiles
    set deactivated_at = now()
    where id = p_user_id;

    update auth.users
    set banned_until = '3000-01-01 00:00:00+00'
    where id = p_user_id;
  end if;
end; $$;

-- ── 6. Mobile Offline Mode Deduplication ─────────────────────────────────────
alter table public.attendance_records add column if not exists client_uuid uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_client_uuid_key'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_client_uuid_key unique (company_id, client_uuid);
  end if;
end $$;

-- SCIM helper to lookup global auth.users by email
create or replace function public.get_user_id_by_email(p_email text)
returns uuid language plpgsql security definer set search_path = auth as $$
begin
  return (select id from users where lower(email) = lower(p_email) limit 1);
end; $$;

