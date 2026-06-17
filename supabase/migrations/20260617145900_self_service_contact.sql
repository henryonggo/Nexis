-- Migration: Self-service contact & bank edit RPC
-- Date: 2026-06-17

-- Create SECURITY DEFINER RPC to let employees edit their own contact phone and bank details
create or replace function public.update_own_contact(
  p_phone text,
  p_bank_name text,
  p_account_no text,
  p_account_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp employees;
begin
  -- Fetch the employee record linked to the calling user
  select * into v_emp from employees where user_id = auth.uid() limit 1;
  if v_emp.id is null then
    raise exception 'NO_EMPLOYEE_RECORD';
  end if;

  -- Update employee phone number
  update employees
  set phone = nullif(p_phone, ''),
      updated_at = now()
  where id = v_emp.id;

  -- Upsert primary bank account details if any are provided
  if coalesce(p_bank_name, '') <> '' or coalesce(p_account_no, '') <> '' or coalesce(p_account_name, '') <> '' then
    if exists (select 1 from bank_accounts where employee_id = v_emp.id and is_primary = true) then
      update bank_accounts
      set bank_name = nullif(p_bank_name, ''),
          account_no = nullif(p_account_no, ''),
          account_name = nullif(p_account_name, '')
      where employee_id = v_emp.id and is_primary = true;
    else
      insert into bank_accounts (company_id, employee_id, bank_name, account_no, account_name, is_primary)
      values (v_emp.company_id, v_emp.id, nullif(p_bank_name, ''), nullif(p_account_no, ''), nullif(p_account_name, ''), true);
    end if;
  end if;
end;
$$;

-- Grant execution to authenticated users
grant execute on function public.update_own_contact(text, text, text, text) to authenticated;
