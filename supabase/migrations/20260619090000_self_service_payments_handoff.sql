-- Nexis — Self-service and Payments DB Handoffs (H-2, H-3, H-5)
-- Date: 2026-06-19

-- ── 1. Create safe UUID cast helper function ───────────────────────────────
create or replace function public.safe_cast_uuid(p_val text)
returns uuid language plpgsql immutable strict as $$
begin
  if p_val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return p_val::uuid;
  end if;
  return null;
exception when others then
  return null;
end; $$;

grant execute on function public.safe_cast_uuid(text) to authenticated;

-- ── 2. Update User Can Manage Employee function (H-2) ────────────────────────
create or replace function public.user_can_manage_employee(p_employee_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_manager_id uuid;
  v_target_user_id uuid;
  v_caller_role public.company_role;
  v_caller_employee_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select company_id, manager_id, user_id 
  into v_company_id, v_manager_id, v_target_user_id
  from public.employees
  where id = p_employee_id;

  if v_company_id is null then
    return false;
  end if;

  v_caller_role := public.user_role_in_company(v_company_id);

  -- Self-approval checks: Employee cannot self-approve; Owner can self-approve.
  if v_target_user_id = auth.uid() then
    return v_caller_role = 'owner';
  end if;

  -- Non-self approval/management checks
  if v_caller_role in ('owner', 'admin') then
    return true;
  end if;

  if v_caller_role = 'manager' then
    -- Find caller's own employee ID in this company
    select id into v_caller_employee_id
    from public.employees
    where user_id = auth.uid() and company_id = v_company_id;

    if v_caller_employee_id is null then
      return false;
    end if;

    if v_manager_id is not null then
      -- Employee has an appointed manager; caller must be that manager
      return v_manager_id = v_caller_employee_id;
    else
      -- If manager_id is null, any manager in the company can manage
      return true;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.user_can_manage_employee(uuid) to authenticated;

-- ── 3. Alter Compensation Table for Payment Method (H-3) ─────────────────────
alter table public.compensation
  add column if not exists payment_method text not null default 'cash'
  constraint compensation_payment_method_check
  check (payment_method in ('cash', 'bank'));

-- ── 4. Alter Payroll Items Table for Paid Tracking (H-3) ─────────────────────
alter table public.payroll_items
  add column if not exists paid_at timestamptz null,
  add column if not exists paid_method text null
  constraint payroll_items_paid_method_check
  check (paid_method in ('cash', 'bank'));

-- ── 5. Create mark_payroll_items_paid RPC function (H-3) ─────────────────────
create or replace function public.mark_payroll_items_paid(
  p_payroll_item_ids uuid[],
  p_payment_method text default 'cash'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_payment_method not in ('cash', 'bank') then
    raise exception 'invalid payment method';
  end if;

  if array_length(p_payroll_item_ids, 1) is null or array_length(p_payroll_item_ids, 1) = 0 then
    return;
  end if;

  -- Verify caller is admin/owner for all distinct companies involved in the payroll items
  for v_company_id in
    select distinct company_id
    from public.payroll_items
    where id = any(p_payroll_item_ids)
  loop
    if not public.user_is_company_admin(v_company_id) then
      raise exception 'Unauthorized to mark payroll items paid';
    end if;
  end loop;

  -- Update payroll items
  update public.payroll_items
  set paid_at = now(),
      paid_method = p_payment_method
  where id = any(p_payroll_item_ids);

  -- Log action in audit logs for each company
  for v_company_id in
    select distinct company_id
    from public.payroll_items
    where id = any(p_payroll_item_ids)
  loop
    insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
    values (
      v_company_id,
      auth.uid(),
      'mark_paid',
      'payroll_items',
      null,
      jsonb_build_object('payroll_item_ids', to_jsonb(p_payroll_item_ids), 'payment_method', p_payment_method)
    );
  end loop;
end;
$$;

grant execute on function public.mark_payroll_items_paid(uuid[], text) to authenticated;

-- ── 6. Update Storage Policies for Robustness (H-5) ──────────────────────────

-- Payslips bucket
drop policy if exists "payslips_bucket: select" on storage.objects;
create policy "payslips_bucket: select" on storage.objects
  for select using (
    bucket_id = 'payslips'
    and (
      public.user_role_in_company(public.safe_cast_uuid(split_part(name, '/', 1))) in ('owner', 'admin', 'accountant')
      or exists (
        select 1 from public.employees
        where id = public.safe_cast_uuid(split_part(name, '/', 2))
          and user_id = auth.uid()
      )
    )
  );

-- Reports bucket
drop policy if exists "reports_bucket: select admin" on storage.objects;
create policy "reports_bucket: select admin" on storage.objects
  for select using (
    bucket_id = 'reports'
    and public.user_role_in_company(public.safe_cast_uuid(split_part(name, '/', 1))) in ('owner', 'admin', 'manager', 'accountant')
  );
