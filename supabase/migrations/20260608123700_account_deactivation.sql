-- ============================================================================
-- Nexis — Account deactivation migration.
-- Adds profiles.deactivated_at, access helpers updates, and deactivate RPC.
-- ============================================================================

-- 1. Schema update: Add deactivated_at to profiles
alter table public.profiles add column deactivated_at timestamptz;

-- 2. Create is_current_user_active helper
create or replace function public.is_current_user_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and deactivated_at is null
  );
$$;

-- 3. Redefine tenancy authorization helpers to respect deactivated_at
create or replace function public.user_has_company_access(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members m
    join public.profiles p on p.id = m.user_id
    where m.company_id = target and m.user_id = auth.uid() and p.deactivated_at is null
  );
$$;

create or replace function public.user_role_in_company(target uuid)
returns company_role language sql stable security definer set search_path = public as $$
  select m.role from public.company_members m
  join public.profiles p on p.id = m.user_id
  where m.company_id = target and m.user_id = auth.uid() and p.deactivated_at is null;
$$;

create or replace function public.user_is_company_admin(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members m
    join public.profiles p on p.id = m.user_id
    where m.company_id = target and m.user_id = auth.uid()
      and m.role in ('owner','admin') and p.deactivated_at is null
  );
$$;

-- 4. Redefine profile policies
drop policy if exists "profiles: self read" on public.profiles;
drop policy if exists "profiles: self write" on public.profiles;

create policy "profiles: self read" on public.profiles
  for select using (id = auth.uid() and deactivated_at is null);
create policy "profiles: self write" on public.profiles
  for update using (id = auth.uid() and deactivated_at is null);

-- 5. Redefine employee self read policy
drop policy if exists "employees: self read" on public.employees;

create policy "employees: self read" on public.employees
  for select using (user_id = auth.uid() and public.is_current_user_active());

-- 6. Create deactivate_current_user RPC function
create or replace function public.deactivate_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Set deactivated_at on the profile
  update public.profiles
  set deactivated_at = now()
  where id = v_uid;

  -- Ban the user in auth.users to block sign-in attempts
  update auth.users
  set banned_until = '3000-01-01 00:00:00+00'
  where id = v_uid;
end;
$$;

grant execute on function public.deactivate_current_user() to authenticated;
