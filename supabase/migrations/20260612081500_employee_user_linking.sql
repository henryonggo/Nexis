-- Migration: Employee ↔ User Account Linking
-- 1. Extend accept_invitation to link employee records
-- 2. Backfill existing accepted invitations
-- 3. Add link_employee_account RPC for manual linking

-- Extend accept_invitation
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv invitations%rowtype;
  v_email text;
  v_employee_id uuid;
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

  -- Find matching employee in the same company
  select id into v_employee_id
  from public.employees
  where company_id = v_inv.company_id
    and lower(email) = lower(v_email)
    and user_id is null
  limit 1;

  insert into company_members (company_id, user_id, role, employee_id)
  values (v_inv.company_id, auth.uid(), v_inv.role, v_employee_id)
  on conflict (company_id, user_id) do update set 
    role = excluded.role,
    employee_id = coalesce(company_members.employee_id, excluded.employee_id);

  -- Link all matching unclaimed employees in the company
  update public.employees
  set user_id = auth.uid()
  where company_id = v_inv.company_id
    and lower(email) = lower(v_email)
    and user_id is null;

  update invitations set status = 'accepted' where id = v_inv.id;
  return v_inv.company_id;
end; $$;

-- Backfill already-accepted invites
-- Step A: Link employees.user_id using invitations and auth.users
update public.employees e
set user_id = u.id
from public.invitations i
join auth.users u on lower(u.email) = lower(i.email)
where e.company_id = i.company_id
  and lower(e.email) = lower(i.email)
  and e.user_id is null
  and i.status = 'accepted';

-- Step B: Link company_members.employee_id where user_id matches
update public.company_members cm
set employee_id = e.id
from public.employees e
where cm.company_id = e.company_id
  and cm.user_id = e.user_id
  and cm.employee_id is null
  and e.user_id is not null;

-- RPC for manual re-link
create or replace function public.link_employee_account(
  p_employee_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select company_id into v_company_id from public.employees where id = p_employee_id;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  if not public.user_is_company_admin(v_company_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Link user to the employee record
  update public.employees
  set user_id = p_user_id
  where id = p_employee_id;

  -- Synchronize company_members.employee_id
  if p_user_id is not null then
    insert into public.company_members (company_id, user_id, role, employee_id)
    values (v_company_id, p_user_id, 'employee', p_employee_id)
    on conflict (company_id, user_id) do update set
      employee_id = excluded.employee_id;
  else
    update public.company_members
    set employee_id = null
    where company_id = v_company_id
      and employee_id = p_employee_id;
  end if;
end; $$;

grant execute on function public.link_employee_account(uuid, uuid) to authenticated;
