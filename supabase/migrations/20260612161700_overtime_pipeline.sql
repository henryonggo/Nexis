-- Migration: Overtime Pipeline (Case-02 G5)
-- 1. Create unique index on overtime_entries(employee_id, date)
-- 2. Implement public.recompute_employee_overtime(p_employee_id, p_date)
-- 3. Implement public.generate_overtime_entries(p_company_id, p_date)
-- 4. Create trigger on attendance_records to call recompute_employee_overtime

-- Create unique constraint index
create unique index if not exists overtime_entries_employee_date_idx on public.overtime_entries(employee_id, date);

-- Helper to recompute overtime for a single employee and date
create or replace function public.recompute_employee_overtime(
  p_employee_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_ot record;
begin
  select company_id into v_company_id from public.employees where id = p_employee_id;
  if v_company_id is null then return; end if;

  select * into v_ot from public.calculate_overtime_hours(p_employee_id, p_date);
  
  if v_ot.overtime_minutes > 0 then
    insert into public.overtime_entries (company_id, employee_id, date, duration_minutes, multiplier, is_approved)
    values (v_company_id, p_employee_id, p_date, v_ot.overtime_minutes, case when v_ot.is_rest_day then 2.0 else 1.0 end, false)
    on conflict (employee_id, date) do update set
      duration_minutes = excluded.duration_minutes,
      multiplier = excluded.multiplier,
      updated_at = now()
    where overtime_entries.is_approved = false;
  else
    delete from public.overtime_entries
    where employee_id = p_employee_id
      and date = p_date
      and is_approved = false;
  end if;
exception when others then
  raise notice 'recompute_employee_overtime exception: %', SQLERRM;
end; $$;

-- Set-based function for cron or manual runs
create or replace function public.generate_overtime_entries(
  p_company_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct e.id as employee_id
    from public.employees e
    join public.attendance_records a on e.id = a.employee_id
    where e.company_id = p_company_id
      and a.event_at::date = p_date
      and a.kind = 'clock_out'
      and e.status in ('active', 'probation')
  loop
    perform public.recompute_employee_overtime(r.employee_id, p_date);
  end loop;
end; $$;

-- Trigger function for attendance changes
create or replace function public.on_attendance_change_for_overtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.recompute_employee_overtime(new.employee_id, cast(new.event_at as date));
  elsif TG_OP = 'UPDATE' then
    perform public.recompute_employee_overtime(new.employee_id, cast(new.event_at as date));
    if old.employee_id <> new.employee_id or old.event_at::date <> new.event_at::date then
      perform public.recompute_employee_overtime(old.employee_id, cast(old.event_at as date));
    end if;
  elsif TG_OP = 'DELETE' then
    perform public.recompute_employee_overtime(old.employee_id, cast(old.event_at as date));
  end if;
  return coalesce(new, old);
exception when others then
  raise notice 'on_attendance_change_for_overtime exception: %', SQLERRM;
  return coalesce(new, old);
end; $$;

-- Create trigger on attendance_records
create or replace trigger trg_attendance_overtime
  after insert or update or delete on public.attendance_records
  for each row execute function public.on_attendance_change_for_overtime();

-- Drop and recreate RLS policies to enforce update restrictions with a 42501 exception
drop policy if exists "overtime: admin modify" on public.overtime_entries;

create policy "overtime: admin modify" on public.overtime_entries
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

create policy "overtime: employee update check" on public.overtime_entries
  for update
  using (employee_id in (select id from public.employees where user_id = auth.uid()))
  with check (public.user_is_company_admin(company_id));
