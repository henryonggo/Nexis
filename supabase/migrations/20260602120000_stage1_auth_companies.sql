-- ============================================================================
-- Nexis — Stage 1 migration: auth profiles, companies, memberships, settings,
-- billing, RLS, and the atomic company-provisioning RPC.
-- See docs/03-database-schema.md and docs/stages/stage-01-auth.md.
-- All money is whole rupiah (bigint). RLS is mandatory on tenant tables.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
create type company_role as enum ('owner','admin','manager','employee');
create type plan_tier    as enum ('free','starter','growth','enterprise');

-- ── profiles (1:1 with auth.users) ──────────────────────────────────────────
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

-- Auto-create a profile row whenever a new auth user is created.
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

-- ── companies + membership (multi-company core) ─────────────────────────────
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
  employee_id uuid,                          -- linked in Stage 2 when member is paid staff
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

create index on company_members(user_id);
create index on company_members(company_id);

-- ── Authorization helper functions (single source of truth) ─────────────────
create or replace function public.user_has_company_access(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = target and user_id = auth.uid()
  );
$$;

create or replace function public.user_role_in_company(target uuid)
returns company_role language sql stable security definer set search_path = public as $$
  select role from public.company_members
  where company_id = target and user_id = auth.uid();
$$;

create or replace function public.user_is_company_admin(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = target and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

-- ── RLS for companies & members ─────────────────────────────────────────────
alter table companies enable row level security;
alter table company_members enable row level security;

create policy "companies: members read" on companies
  for select using (public.user_has_company_access(id));

create policy "companies: admin update" on companies
  for update using (public.user_is_company_admin(id));

create policy "companies: owner delete" on companies
  for delete using (public.user_role_in_company(id) = 'owner');

create policy "members: company read" on company_members
  for select using (public.user_has_company_access(company_id));

create policy "members: admin write" on company_members
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- ── company_settings & company_billing ──────────────────────────────────────
create table company_settings (
  company_id         uuid primary key references companies(id) on delete cascade,
  payroll_cutoff_day smallint not null default 25,
  pay_date_day       smallint not null default 1,
  workweek_days      smallint not null default 5,
  jkk_risk_class     text default 'very_low',
  default_currency   text not null default 'IDR',
  updated_at         timestamptz not null default now()
);

create table company_billing (
  company_id      uuid primary key references companies(id) on delete cascade,
  plan            plan_tier not null default 'free',
  -- Legal/tax fields: NULLABLE while free. Required only on upgrade.
  npwp            text,
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
  for select using (public.user_has_company_access(company_id));
create policy "settings: admin write" on company_settings
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

create policy "billing: admin read"  on company_billing
  for select using (public.user_is_company_admin(company_id));
create policy "billing: owner write" on company_billing
  for all using (public.user_role_in_company(company_id) = 'owner')
  with check (public.user_role_in_company(company_id) = 'owner');

-- ── Atomic company provisioning (signup creates company + owner) ────────────
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

grant execute on function public.create_company_with_owner(text, text) to authenticated;
