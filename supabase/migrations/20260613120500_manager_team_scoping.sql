-- ============================================================================
-- Nexis — Manager "Own Team" Scoping Updates
-- ============================================================================

-- ── 1. Create Helper function user_can_manage_employee ──────────────────────
create or replace function public.user_can_manage_employee(p_employee_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_manager_id uuid;
  v_caller_role public.company_role;
  v_caller_employee_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select company_id, manager_id into v_company_id, v_manager_id
  from public.employees
  where id = p_employee_id;

  if v_company_id is null then
    return false;
  end if;

  v_caller_role := public.user_role_in_company(v_company_id);

  if v_caller_role in ('owner', 'admin') then
    return true;
  end if;

  if v_caller_role = 'manager' then
    select id into v_caller_employee_id
    from public.employees
    where user_id = auth.uid() and company_id = v_company_id;

    if v_caller_employee_id is not null and v_manager_id = v_caller_employee_id then
      return true;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.user_can_manage_employee(uuid) to authenticated;

-- ── 2. Update Overtime RLS Policies ──────────────────────────────────────────
drop policy if exists "overtime: select" on public.overtime_entries;
drop policy if exists "overtime: admin modify" on public.overtime_entries;

create policy "overtime: select" on public.overtime_entries
  for select using (
    public.user_can_manage_employee(employee_id)
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy "overtime: admin modify" on public.overtime_entries
  for all using (
    public.user_can_manage_employee(employee_id)
  )
  with check (
    public.user_can_manage_employee(employee_id)
    and (
      employee_id not in (select id from public.employees where user_id = auth.uid())
      or not is_approved
    )
  );

-- ── 3. Update Attendance RLS Policies ────────────────────────────────────────
drop policy if exists "attendance: select" on public.attendance_records;
drop policy if exists "attendance: admin modify" on public.attendance_records;

create policy "attendance: select" on public.attendance_records
  for select using (
    public.user_can_manage_employee(employee_id)
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy "attendance: admin modify" on public.attendance_records
  for all using (
    public.user_can_manage_employee(employee_id)
  )
  with check (
    public.user_can_manage_employee(employee_id)
  );

-- ── 4. Update Leave Requests RLS Policies ────────────────────────────────────
drop policy if exists "leave_requests: select" on public.leave_requests;
drop policy if exists "leave_requests: update" on public.leave_requests;

create policy "leave_requests: select" on public.leave_requests
  for select using (
    public.user_can_manage_employee(employee_id)
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy "leave_requests: update" on public.leave_requests
  for update using (
    public.user_can_manage_employee(employee_id)
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status = 'pending'
    )
  )
  with check (
    public.user_can_manage_employee(employee_id)
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status in ('pending', 'cancelled')
    )
  );

-- ── 5. Update Reimbursement Claims RLS Policies ──────────────────────────────
drop policy if exists "reimbursement_claims: select" on public.reimbursement_claims;
drop policy if exists "reimbursement_claims: update" on public.reimbursement_claims;

create policy "reimbursement_claims: select" on public.reimbursement_claims
  for select using (
    public.user_can_manage_employee(employee_id)
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy "reimbursement_claims: update" on public.reimbursement_claims
  for update using (
    public.user_can_manage_employee(employee_id)
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status = 'pending'
    )
  )
  with check (
    public.user_can_manage_employee(employee_id)
    or (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      and status = 'pending'
    )
  );

-- ── 6. Redefine Approval RPC Functions ───────────────────────────────────────

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
  if not public.user_can_manage_employee(v_employee_id) then
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
  if not public.user_can_manage_employee(v_employee_id) then
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
  if not public.user_can_manage_employee(v_employee_id) then
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
  if not public.user_can_manage_employee(v_employee_id) then
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

-- Re-grant execute permissions
grant execute on function public.approve_leave(uuid) to authenticated;
grant execute on function public.reject_leave(uuid, text) to authenticated;
grant execute on function public.approve_claim(uuid, text) to authenticated;
grant execute on function public.reject_claim(uuid, text) to authenticated;
