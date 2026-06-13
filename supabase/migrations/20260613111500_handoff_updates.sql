-- ============================================================================
-- Nexis — Overtime Approval Roles & Plan/NPWP Gating Updates
-- ============================================================================

-- ── 1. Create Helper for Manager and Admin role check ───────────────────────
create or replace function public.user_is_company_manager_or_admin(target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  return (public.user_role_in_company(target) in ('owner', 'admin', 'manager'));
end;
$$;

grant execute on function public.user_is_company_manager_or_admin(uuid) to authenticated;

-- ── 2. Update Overtime Approval Policies for Managers ────────────────────────
drop policy if exists "overtime: admin modify" on public.overtime_entries;
drop policy if exists "overtime: employee update check" on public.overtime_entries;

-- Policy to allow owners, admins, and managers to manage overtime entries.
-- Prevents any user from approving their own overtime entry.
create policy "overtime: admin modify" on public.overtime_entries
  for all using (
    public.user_is_company_manager_or_admin(company_id)
  )
  with check (
    public.user_is_company_manager_or_admin(company_id)
    and (
      employee_id not in (select id from public.employees where user_id = auth.uid())
      or not is_approved
    )
  );

-- Policy to allow employees to update their own unapproved overtime entries,
-- but only if they are company admins (meaning normal employees are blocked,
-- and admins/owners are allowed to adjust but still subject to the check).
create policy "overtime: employee update check" on public.overtime_entries
  for update
  using (
    employee_id in (select id from public.employees where user_id = auth.uid())
  )
  with check (
    public.user_is_company_admin(company_id)
    and not is_approved
  );

-- ── 3. Enforce Plan/NPWP Gating on Payroll Runs ──────────────────────────────
create or replace function public.enforce_payroll_run_gating()
returns trigger as $$
declare
  v_plan public.plan_tier;
  v_npwp text;
  v_run_type text;
begin
  -- Only enforce when moving to 'queued' (or inserting as 'queued')
  if new.status = 'queued' and (old.status is null or old.status != 'queued') then
    -- Load the company's plan and NPWP from company_billing
    select plan, npwp into v_plan, v_npwp
    from public.company_billing
    where company_id = new.company_id;

    -- Extract runType from config_snapshot
    v_run_type := new.config_snapshot->>'runType';

    -- If no runType is in config_snapshot, default to 'monthly'
    if v_run_type is null then
      v_run_type := 'monthly';
    end if;

    -- Gate 1: monthly (tax-affecting) runs on the 'free' plan must be blocked
    if v_run_type = 'monthly' and v_plan = 'free' then
      raise exception 'PLAN_GATE_FREE';
    end if;

    -- Gate 2: monthly (tax-affecting) runs require a company NPWP to be set
    if v_run_type = 'monthly' and (v_npwp is null or trim(v_npwp) = '') then
      raise exception 'NPWP_REQUIRED';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists tr_enforce_payroll_run_gating on public.payroll_runs;

create trigger tr_enforce_payroll_run_gating
before insert or update on public.payroll_runs
for each row execute function public.enforce_payroll_run_gating();
