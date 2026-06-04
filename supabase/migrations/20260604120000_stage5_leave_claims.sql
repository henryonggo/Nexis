-- ============================================================================
-- Nexis — Stage 5 Migration: Leave & Reimbursement Claims
-- ============================================================================

-- ── 0. Audit Logs Table (Stage 1 fallback) ──────────────────────────────────
create table if not exists public.audit_logs (
  id          bigserial primary key,
  company_id  uuid references public.companies(id) on delete cascade,
  actor_id    uuid references auth.users(id),
  action      text not null,
  entity      text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'audit_logs' and policyname = 'audit: admin read'
  ) then
    create policy "audit: admin read" on public.audit_logs
      for select using (company_id is not null and public.user_is_company_admin(company_id));
  end if;
end $$;

-- ── Enums ───────────────────────────────────────────────────────────────────

create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type claim_status as enum ('pending', 'approved', 'rejected', 'paid');

-- ── 1. Leave Tables ─────────────────────────────────────────────────────────

create table leave_types (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  name                text not null,
  paid                boolean not null default true,
  default_annual_days integer not null check (default_annual_days >= 0),
  accrual_method      text not null check (accrual_method in ('monthly', 'annual_lump')),
  min_service_months  integer not null default 0 check (min_service_months >= 0),
  max_carry_over_days integer not null default 0 check (max_carry_over_days >= 0),
  created_at          timestamptz not null default now(),
  unique (company_id, name)
);
create index on leave_types(company_id);

create table leave_balances (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  year          integer not null check (year >= 2000),
  opening_balance numeric(4,1) not null default 0.0 check (opening_balance >= 0),
  accrued       numeric(4,1) not null default 0.0 check (accrued >= 0),
  used          numeric(4,1) not null default 0.0 check (used >= 0),
  carried_over  numeric(4,1) not null default 0.0 check (carried_over >= 0),
  updated_at    timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);
create index on leave_balances(company_id);
create index on leave_balances(employee_id);

create table leave_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  leave_type_id   uuid not null references leave_types(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  days            numeric(4,1) not null check (days > 0),
  half_day        boolean not null default false,
  reason          text,
  attachment_path text,
  status          leave_status not null default 'pending',
  decided_by      uuid references employees(id) on delete set null,
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz not null default now(),
  check (start_date <= end_date)
);
create index on leave_requests(company_id);
create index on leave_requests(employee_id);
create index on leave_requests(leave_type_id);

-- ── 2. Claim Tables ─────────────────────────────────────────────────────────

create table claim_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  taxable    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
create index on claim_types(company_id);

create table reimbursement_claims (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  claim_type_id  uuid not null references claim_types(id) on delete cascade,
  amount         bigint not null check (amount >= 0),
  description    text,
  receipt_path   text,
  status         claim_status not null default 'pending',
  payroll_run_id uuid references payroll_runs(id) on delete set null,
  decided_by     uuid references employees(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);
create index on reimbursement_claims(company_id);
create index on reimbursement_claims(employee_id);
create index on reimbursement_claims(claim_type_id);

-- ── 3. Notification Tokens Table ────────────────────────────────────────────

create table expo_push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
create index on expo_push_tokens(user_id);

-- ── 4. Enable Row Level Security (RLS) ──────────────────────────────────────

alter table leave_types enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table claim_types enable row level security;
alter table reimbursement_claims enable row level security;
alter table expo_push_tokens enable row level security;

-- ── 5. Define RLS Policies ──────────────────────────────────────────────────

-- leave_types
create policy "leave_types: select" on leave_types
  for select using (public.user_has_company_access(company_id));
create policy "leave_types: admin write" on leave_types
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- leave_balances
create policy "leave_balances: select" on leave_balances
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "leave_balances: admin write" on leave_balances
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- leave_requests
create policy "leave_requests: select" on leave_requests
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "leave_requests: employee insert" on leave_requests
  for insert with check (
    employee_id in (
      select id from public.employees where user_id = auth.uid() and company_id = leave_requests.company_id
    )
  );
create policy "leave_requests: update" on leave_requests
  for update using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status = 'pending'
    )
  )
  with check (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status in ('pending', 'cancelled')
    )
  );

-- claim_types
create policy "claim_types: select" on claim_types
  for select using (public.user_has_company_access(company_id));
create policy "claim_types: admin write" on claim_types
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- reimbursement_claims
create policy "reimbursement_claims: select" on reimbursement_claims
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "reimbursement_claims: employee insert" on reimbursement_claims
  for insert with check (
    employee_id in (
      select id from public.employees where user_id = auth.uid() and company_id = reimbursement_claims.company_id
    )
  );
create policy "reimbursement_claims: update" on reimbursement_claims
  for update using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status = 'pending'
    )
  )
  with check (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status = 'pending'
    )
  );

-- expo_push_tokens
create policy "expo_push_tokens: select self" on expo_push_tokens for select using (user_id = auth.uid());
create policy "expo_push_tokens: insert self" on expo_push_tokens for insert with check (user_id = auth.uid());
create policy "expo_push_tokens: delete self" on expo_push_tokens for delete using (user_id = auth.uid());

-- ── 6. Storage Buckets for Attachments and Receipts ────────────────────────

insert into storage.buckets (id, name, public)
values ('leave-attachments', 'leave-attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('claim-receipts', 'claim-receipts', false)
on conflict (id) do nothing;

-- leave-attachments policies
create policy "leave-attachments: select" on storage.objects
  for select using (
    bucket_id = 'leave-attachments'
    and (
      public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
      or exists (
        select 1 from public.employees
        where id = cast(split_part(name, '/', 2) as uuid)
          and user_id = auth.uid()
      )
    )
  );

create policy "leave-attachments: insert" on storage.objects
  for insert with check (
    bucket_id = 'leave-attachments'
    and exists (
      select 1 from public.employees
      where id = cast(split_part(name, '/', 2) as uuid)
        and company_id = cast(split_part(name, '/', 1) as uuid)
        and user_id = auth.uid()
    )
  );

create policy "leave-attachments: admin write" on storage.objects
  for all using (
    bucket_id = 'leave-attachments'
    and public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
  );

-- claim-receipts policies
create policy "claim-receipts: select" on storage.objects
  for select using (
    bucket_id = 'claim-receipts'
    and (
      public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
      or exists (
        select 1 from public.employees
        where id = cast(split_part(name, '/', 2) as uuid)
          and user_id = auth.uid()
      )
    )
  );

create policy "claim-receipts: insert" on storage.objects
  for insert with check (
    bucket_id = 'claim-receipts'
    and exists (
      select 1 from public.employees
      where id = cast(split_part(name, '/', 2) as uuid)
        and company_id = cast(split_part(name, '/', 1) as uuid)
        and user_id = auth.uid()
    )
  );

create policy "claim-receipts: admin write" on storage.objects
  for all using (
    bucket_id = 'claim-receipts'
    and public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
  );

-- ── 7. Realtime Publication Settings ───────────────────────────────────────

alter publication supabase_realtime add table leave_requests;
alter publication supabase_realtime add table reimbursement_claims;

-- ── 8. SECURITY DEFINER RPC Functions for Approvals ─────────────────────────

-- approve_leave
create or replace function public.approve_leave(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_leave_type_id uuid;
  v_days numeric(4,1);
  v_year integer;
  v_manager_employee_id uuid;
  v_request_status leave_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load request details
  select company_id, employee_id, leave_type_id, days, extract(year from start_date)::integer, status
  into v_company_id, v_employee_id, v_leave_type_id, v_days, v_year, v_request_status
  from public.leave_requests
  where id = p_request_id;

  if v_company_id is null then
    raise exception 'Leave request not found';
  end if;

  -- Verify manager/admin authority
  if not public.user_role_in_company(v_company_id) in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to approve leave requests for this company';
  end if;

  if v_request_status != 'pending' then
    raise exception 'Only pending leave requests can be approved';
  end if;

  -- Get manager employee ID
  select id into v_manager_employee_id
  from public.employees
  where user_id = auth.uid() and company_id = v_company_id;

  -- Update leave request
  update public.leave_requests
  set status = 'approved',
      decided_by = v_manager_employee_id,
      decided_at = now()
  where id = p_request_id;

  -- Ensure balance record exists and decrement balance (increment used)
  insert into public.leave_balances (company_id, employee_id, leave_type_id, year, opening_balance, accrued, used, carried_over)
  values (v_company_id, v_employee_id, v_leave_type_id, v_year, 0, 0, v_days, 0)
  on conflict (employee_id, leave_type_id, year) do update
  set used = leave_balances.used + v_days;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'approve_leave',
    'leave_requests',
    p_request_id,
    jsonb_build_object('employee_id', v_employee_id, 'days', v_days)
  );
end; $$;

-- reject_leave
create or replace function public.reject_leave(p_request_id uuid, p_decision_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_manager_employee_id uuid;
  v_request_status leave_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load request details
  select company_id, employee_id, status
  into v_company_id, v_employee_id, v_request_status
  from public.leave_requests
  where id = p_request_id;

  if v_company_id is null then
    raise exception 'Leave request not found';
  end if;

  -- Verify manager/admin authority
  if not public.user_role_in_company(v_company_id) in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to reject leave requests for this company';
  end if;

  if v_request_status != 'pending' then
    raise exception 'Only pending leave requests can be rejected';
  end if;

  -- Get manager employee ID
  select id into v_manager_employee_id
  from public.employees
  where user_id = auth.uid() and company_id = v_company_id;

  -- Update leave request
  update public.leave_requests
  set status = 'rejected',
      decided_by = v_manager_employee_id,
      decided_at = now(),
      decision_note = p_decision_note
  where id = p_request_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'reject_leave',
    'leave_requests',
    p_request_id,
    jsonb_build_object('employee_id', v_employee_id, 'decision_note', p_decision_note)
  );
end; $$;

-- approve_claim
create or replace function public.approve_claim(p_claim_id uuid, p_decision_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_manager_employee_id uuid;
  v_claim_status claim_status;
  v_amount bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load claim details
  select company_id, employee_id, status, amount
  into v_company_id, v_employee_id, v_claim_status, v_amount
  from public.reimbursement_claims
  where id = p_claim_id;

  if v_company_id is null then
    raise exception 'Reimbursement claim not found';
  end if;

  -- Verify authority
  if not public.user_role_in_company(v_company_id) in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to approve claims for this company';
  end if;

  if v_claim_status != 'pending' then
    raise exception 'Only pending claims can be approved';
  end if;

  -- Get manager employee ID
  select id into v_manager_employee_id
  from public.employees
  where user_id = auth.uid() and company_id = v_company_id;

  -- Update claim request
  update public.reimbursement_claims
  set status = 'approved',
      decided_by = v_manager_employee_id,
      decided_at = now(),
      decision_note = p_decision_note
  where id = p_claim_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'approve_claim',
    'reimbursement_claims',
    p_claim_id,
    jsonb_build_object('employee_id', v_employee_id, 'amount', v_amount)
  );
end; $$;

-- reject_claim
create or replace function public.reject_claim(p_claim_id uuid, p_decision_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_manager_employee_id uuid;
  v_claim_status claim_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load claim details
  select company_id, employee_id, status
  into v_company_id, v_employee_id, v_claim_status
  from public.reimbursement_claims
  where id = p_claim_id;

  if v_company_id is null then
    raise exception 'Reimbursement claim not found';
  end if;

  -- Verify authority
  if not public.user_role_in_company(v_company_id) in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to reject claims for this company';
  end if;

  if v_claim_status != 'pending' then
    raise exception 'Only pending claims can be rejected';
  end if;

  -- Get manager employee ID
  select id into v_manager_employee_id
  from public.employees
  where user_id = auth.uid() and company_id = v_company_id;

  -- Update claim request
  update public.reimbursement_claims
  set status = 'rejected',
      decided_by = v_manager_employee_id,
      decided_at = now(),
      decision_note = p_decision_note
  where id = p_claim_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'reject_claim',
    'reimbursement_claims',
    p_claim_id,
    jsonb_build_object('employee_id', v_employee_id, 'decision_note', p_decision_note)
  );
end; $$;

-- Grant permissions to authenticated users
grant execute on function public.approve_leave(uuid) to authenticated;
grant execute on function public.reject_leave(uuid, text) to authenticated;
grant execute on function public.approve_claim(uuid, text) to authenticated;
grant execute on function public.reject_claim(uuid, text) to authenticated;
