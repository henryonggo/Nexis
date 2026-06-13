-- ============================================================================
-- Nexis — Stage 6: Pre-Run Payroll Validation RPC (G7)
-- ============================================================================

create or replace function public.get_payroll_readiness(p_company_id uuid)
returns table (
  employee_id uuid,
  full_name text,
  has_compensation boolean,
  has_tax_profile boolean,
  has_bank_account boolean,
  is_ready boolean,
  issues text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.user_is_company_admin(p_company_id) then
    raise exception 'Unauthorized to view payroll readiness for this company';
  end if;

  return query
  with emp_checks as (
    select
      e.id as emp_id,
      e.full_name as emp_name,
      exists(select 1 from public.compensation c where c.employee_id = e.id) as has_comp,
      exists(select 1 from public.tax_profile t where t.employee_id = e.id) as has_tax,
      exists(select 1 from public.bank_accounts b where b.employee_id = e.id) as has_bank
    from public.employees e
    where e.company_id = p_company_id
      and e.status = 'active'
  )
  select
    emp_id,
    emp_name,
    has_comp,
    has_tax,
    has_bank,
    (has_comp and has_tax and has_bank) as is_ready,
    array_remove(
      array[
        case when not has_comp then 'missing_compensation' else null end,
        case when not has_tax then 'missing_tax_profile' else null end,
        case when not has_bank then 'missing_bank_account' else null end
      ],
      null
    ) as issues
  from emp_checks;
end;
$$;

grant execute on function public.get_payroll_readiness(uuid) to authenticated;
