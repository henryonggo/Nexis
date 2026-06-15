-- Nexis — Two-way company join (invite + self-request)

-- 1. Helper functions for join code generation
create or replace function public.generate_random_join_code()
returns text
language plpgsql as $$
declare
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end; $$;

create or replace function public.generate_unique_join_code()
returns text
language plpgsql as $$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := public.generate_random_join_code();
    select exists(select 1 from public.companies where join_code = v_code) into v_exists;
    if not v_exists then
      return v_code;
    end if;
  end loop;
end; $$;

-- 2. Alter companies to add join_code
alter table public.companies add column join_code text;

-- Generate join codes for existing companies
update public.companies
set join_code = public.generate_unique_join_code()
where join_code is null;

-- Make join_code not null, unique, and set default
alter table public.companies alter column join_code set not null;
alter table public.companies add constraint companies_join_code_key unique (join_code);
alter table public.companies alter column join_code set default public.generate_unique_join_code();

-- 3. Create company_join_requests table
create table public.company_join_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);

-- Unique partial index on (company_id, user_id) where status = 'pending' (no duplicate pending requests)
create unique index company_join_requests_no_dup_pending 
  on public.company_join_requests(company_id, user_id) 
  where status = 'pending';

-- 4. Enable Row Level Security (RLS) on company_join_requests
alter table public.company_join_requests enable row level security;

-- Select policy: requester reads own; owner/admin of the company read company's rows
create policy "join_requests: select" on public.company_join_requests
  for select using (
    user_id = auth.uid()
    or public.user_is_company_admin(company_id)
  );

-- 5. Implement RPC public.rotate_company_join_code
create or replace function public.rotate_company_join_code(p_company_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_new_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.user_is_company_admin(p_company_id) then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  v_new_code := public.generate_unique_join_code();

  update public.companies
  set join_code = v_new_code
  where id = p_company_id;

  return v_new_code;
end; $$;

-- 6. Implement RPC public.request_company_join
create or replace function public.request_company_join(p_join_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_email text;
  v_is_member boolean;
  v_is_pending boolean;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Resolve company by code (case-insensitive check)
  select id into v_company_id
  from public.companies
  where lower(join_code) = lower(p_join_code);

  if v_company_id is null then
    raise exception 'INVALID_CODE';
  end if;

  -- Check if already member
  select exists(
    select 1 from public.company_members
    where company_id = v_company_id and user_id = auth.uid()
  ) into v_is_member;

  if v_is_member then
    raise exception 'ALREADY_MEMBER';
  end if;

  -- Check if already has a pending request
  select exists(
    select 1 from public.company_join_requests
    where company_id = v_company_id and user_id = auth.uid() and status = 'pending'
  ) into v_is_pending;

  if v_is_pending then
    raise exception 'ALREADY_PENDING';
  end if;

  -- Get user email from auth
  select email into v_email
  from auth.users
  where id = auth.uid();

  -- Insert pending request
  insert into public.company_join_requests (company_id, user_id, email, status)
  values (v_company_id, auth.uid(), v_email, 'pending')
  returning id into v_request_id;

  return v_request_id;
end; $$;

-- 7. Implement RPC public.approve_join_request
create or replace function public.approve_join_request(
  p_request_id uuid,
  p_role company_role
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_status text;
  v_requester_user_id uuid;
  v_email text;
  v_caller_role company_role;
  v_employee_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Get request info
  select company_id, status, user_id, email into v_company_id, v_status, v_requester_user_id, v_email
  from public.company_join_requests
  where id = p_request_id;

  if v_company_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_status <> 'pending' then
    raise exception 'REQUEST_ALREADY_DECIDED';
  end if;

  -- Get caller's role
  v_caller_role := public.user_role_in_company(v_company_id);

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  -- Validate role assignment matrix
  if v_caller_role = 'admin' and p_role in ('admin'::company_role, 'owner'::company_role) then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  if p_role = 'owner'::company_role then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  -- Find matching employee in the same company
  select id into v_employee_id
  from public.employees
  where company_id = v_company_id
    and lower(email) = lower(v_email)
    and user_id is null
  limit 1;

  -- Create or update company member
  insert into public.company_members (company_id, user_id, role, employee_id)
  values (v_company_id, v_requester_user_id, p_role, v_employee_id)
  on conflict (company_id, user_id) do update set 
    role = excluded.role,
    employee_id = coalesce(company_members.employee_id, excluded.employee_id);

  -- Link all matching unclaimed employees in the company
  update public.employees
  set user_id = v_requester_user_id
  where company_id = v_company_id
    and lower(email) = lower(v_email)
    and user_id is null;

  -- Consume matching pending invitations if any
  update public.invitations
  set status = 'accepted'
  where company_id = v_company_id
    and lower(email) = lower(v_email)
    and status = 'pending';

  -- Update request status
  update public.company_join_requests
  set status = 'approved',
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;

  -- Insert audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'approve_join_request',
    'company_join_requests',
    p_request_id,
    jsonb_build_object(
      'request_id', p_request_id,
      'user_id', v_requester_user_id,
      'role', p_role
    )
  );
end; $$;

-- 8. Implement RPC public.reject_join_request
create or replace function public.reject_join_request(
  p_request_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_caller_role company_role;
  v_status text;
  v_requester_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Get request info
  select company_id, status, user_id into v_company_id, v_status, v_requester_user_id
  from public.company_join_requests
  where id = p_request_id;

  if v_company_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_status <> 'pending' then
    raise exception 'REQUEST_ALREADY_DECIDED';
  end if;

  -- Get caller's role
  v_caller_role := public.user_role_in_company(v_company_id);

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'INSUFFICIENT_ROLE';
  end if;

  -- Update request
  update public.company_join_requests
  set status = 'rejected',
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;

  -- Insert audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'reject_join_request',
    'company_join_requests',
    p_request_id,
    jsonb_build_object(
      'request_id', p_request_id,
      'user_id', v_requester_user_id,
      'note', p_note
    )
  );
end; $$;

-- 9. Grant execute on RPCs
grant execute on function public.rotate_company_join_code(uuid) to authenticated;
grant execute on function public.request_company_join(text) to authenticated;
grant execute on function public.approve_join_request(uuid, company_role) to authenticated;
grant execute on function public.reject_join_request(uuid, text) to authenticated;
