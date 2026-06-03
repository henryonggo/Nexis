-- ============================================================================
-- Nexis — Stage 2 migration: employees & related, invitations, the free-seat
-- trigger (first 5 employees free), and RLS.
-- See docs/03-database-schema.md and docs/stages/stage-02-company-employees.md.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type employee_status as enum ('active','probation','inactive','terminated');
create type employment_type as enum ('permanent','contract','intern','daily');
create type invite_status   as enum ('pending','accepted','revoked','expired');

-- ── employees ───────────────────────────────────────────────────────────────
create table employees (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  user_id         uuid references auth.users(id),
  employee_no     text,
  full_name       text not null,
  email           text,
  phone           text,
  status          employee_status not null default 'active',
  employment_type employment_type not null default 'permanent',
  join_date       date,
  end_date        date,
  department      text,
  position        text,
  manager_id      uuid references employees(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, employee_no)
);
create index on employees(company_id);
create index on employees(user_id);

-- Now that employees exists, link company_members.employee_id.
alter table company_members
  add constraint company_members_employee_fk
  foreign key (employee_id) references employees(id) on delete set null;

-- Add an FK from company_members.user_id to profiles.id so PostgREST can embed
-- the member's profile (e.g. `select role, profiles(full_name)`). profiles.id is
-- itself 1:1 with auth.users(id), so this is consistent with the existing
-- user_id -> auth.users(id) FK.
alter table company_members
  add constraint company_members_profile_fk
  foreign key (user_id) references profiles(id) on delete cascade;

-- ── compensation ─────────────────────────────────────────────────────────────
create table compensation (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,
  base_salary       bigint not null default 0,          -- whole rupiah / month
  fixed_allowances  jsonb not null default '[]',         -- [{name, amount}]
  pay_frequency     text not null default 'monthly',
  bpjs_kes_enrolled boolean not null default true,
  bpjs_tk_enrolled  boolean not null default true,
  jht_enrolled      boolean not null default true,
  jp_enrolled       boolean not null default true,
  effective_from    date not null default current_date,
  created_at        timestamptz not null default now()
);
create index on compensation(employee_id);

-- ── tax_profile ───────────────────────────────────────────────────────────────
create table tax_profile (
  employee_id  uuid primary key references employees(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  ptkp_status  text not null default 'TK/0',   -- TK/0..TK/3, K/0..K/3
  npwp         text,
  has_npwp     boolean not null default false
);

-- ── bank_accounts ─────────────────────────────────────────────────────────────
create table bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  bank_name    text,
  account_no   text,
  account_name text,
  is_primary   boolean not null default true
);
create index on bank_accounts(employee_id);

-- ── invitations ───────────────────────────────────────────────────────────────
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
create index on invitations(email);

-- ── RLS: employees / compensation / tax_profile / bank_accounts ───────────────
alter table employees    enable row level security;
alter table compensation enable row level security;
alter table tax_profile  enable row level security;
alter table bank_accounts enable row level security;

-- members read; admins write; employee may read their OWN record.
create policy "employees: member read" on employees
  for select using (auth.user_has_company_access(company_id));
create policy "employees: self read" on employees
  for select using (user_id = auth.uid());
create policy "employees: admin write" on employees
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));

create policy "compensation: admin read" on compensation
  for select using (auth.user_is_company_admin(company_id));
create policy "compensation: self read" on compensation
  for select using (exists (
    select 1 from employees e
    where e.id = compensation.employee_id and e.user_id = auth.uid()
  ));
create policy "compensation: admin write" on compensation
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));

create policy "tax_profile: admin read" on tax_profile
  for select using (auth.user_is_company_admin(company_id));
create policy "tax_profile: self read" on tax_profile
  for select using (exists (
    select 1 from employees e
    where e.id = tax_profile.employee_id and e.user_id = auth.uid()
  ));
create policy "tax_profile: admin write" on tax_profile
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));

create policy "bank_accounts: admin read" on bank_accounts
  for select using (auth.user_is_company_admin(company_id));
create policy "bank_accounts: self read" on bank_accounts
  for select using (exists (
    select 1 from employees e
    where e.id = bank_accounts.employee_id and e.user_id = auth.uid()
  ));
create policy "bank_accounts: admin write" on bank_accounts
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));

-- ── RLS: invitations ──────────────────────────────────────────────────────────
alter table invitations enable row level security;
create policy "invites: admin manage" on invitations
  for all using (auth.user_is_company_admin(company_id))
  with check (auth.user_is_company_admin(company_id));

-- ── Free-seat enforcement: first 5 active employees free ──────────────────────
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
    if v_count >= coalesce(v_limit, 5) then
      raise exception 'FREE_SEAT_LIMIT_REACHED'
        using hint = 'Upgrade to add more employees', detail = coalesce(v_limit,5)::text;
    end if;
  end if;
  return new;
end; $$;

create trigger trg_free_seat_limit
  before insert on employees
  for each row execute function public.enforce_free_seat_limit();

-- ── Keep company_billing.active_seats in sync ─────────────────────────────────
create or replace function public.refresh_active_seats(p_company uuid)
returns void language sql security definer set search_path = public as $$
  update company_billing set active_seats = (
    select count(*) from employees
    where company_id = p_company and status in ('active','probation')
  ), updated_at = now()
  where company_id = p_company;
$$;

create or replace function public.on_employee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_active_seats(coalesce(new.company_id, old.company_id));
  return coalesce(new, old);
end; $$;

create trigger trg_employee_seats
  after insert or update or delete on employees
  for each row execute function public.on_employee_change();

-- ── accept_invitation: token + email must match the caller ────────────────────
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select email into v_email from auth.users where id = auth.uid();

  select * into v_inv from invitations
  where token = p_token and status = 'pending'
  for update;

  if not found then raise exception 'INVITE_INVALID'; end if;
  if v_inv.expires_at < now() then
    update invitations set status = 'expired' where id = v_inv.id;
    raise exception 'INVITE_EXPIRED';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  insert into company_members (company_id, user_id, role)
  values (v_inv.company_id, auth.uid(), v_inv.role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  update invitations set status = 'accepted' where id = v_inv.id;
  return v_inv.company_id;
end; $$;

grant execute on function public.accept_invitation(text) to authenticated;
