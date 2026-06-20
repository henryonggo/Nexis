-- Fix: process_webhook_events_trigger referenced non-existent columns on
-- payroll_runs (period_start / period_end / updated_at), causing
-- "record \"new\" has no field \"period_start\"" when the payroll worker
-- finalized a run (status -> completed). payroll_runs actually has
-- period_year, period_month, completed_at. Recreate the function with the
-- correct columns in the payroll_runs branch; all other branches unchanged.

create or replace function public.process_webhook_events_trigger()
returns trigger as $$
declare
  v_event_type text;
  v_company_id uuid;
  v_payload jsonb;
  v_webhook_row record;
  v_queue_id uuid;
begin
  -- 1. Determine event type and payload and company_id
  if TG_TABLE_NAME = 'employees' then
    v_company_id := coalesce(new.company_id, old.company_id);
    if TG_OP = 'INSERT' then
      v_event_type := 'employee.created';
      v_payload := jsonb_build_object(
        'id', new.id,
        'company_id', new.company_id,
        'full_name', new.full_name,
        'status', new.status,
        'created_at', new.created_at
      );
    elsif TG_OP = 'UPDATE' then
      v_event_type := 'employee.updated';
      v_payload := jsonb_build_object(
        'id', new.id,
        'company_id', new.company_id,
        'full_name', new.full_name,
        'status', new.status,
        'updated_at', new.updated_at
      );
    else
      return null;
    end if;

  elsif TG_TABLE_NAME = 'attendance_records' then
    v_company_id := coalesce(new.company_id, old.company_id);
    if TG_OP = 'INSERT' then
      if new.kind = 'clock_in' then
        v_event_type := 'attendance.clock_in';
      elsif new.kind = 'clock_out' then
        v_event_type := 'attendance.clock_out';
      else
        return new; -- Ignore break_start / break_end
      end if;
      v_payload := jsonb_build_object(
        'id', new.id,
        'company_id', new.company_id,
        'employee_id', new.employee_id,
        'kind', new.kind,
        'created_at', new.created_at
      );
    else
      return new;
    end if;

  elsif TG_TABLE_NAME = 'payroll_runs' then
    v_company_id := coalesce(new.company_id, old.company_id);
    -- Trigger payroll.completed on transition to completed or paid
    if TG_OP = 'UPDATE' and new.status in ('completed', 'paid') and old.status not in ('completed', 'paid') then
      v_event_type := 'payroll.completed';
      v_payload := jsonb_build_object(
        'id', new.id,
        'company_id', new.company_id,
        'period_year', new.period_year,
        'period_month', new.period_month,
        'status', new.status,
        'completed_at', new.completed_at
      );
    else
      return new;
    end if;
  else
    return null;
  end if;

  -- 2. Find matching active webhooks
  for v_webhook_row in (
    select id
    from public.company_webhooks
    where company_id = v_company_id
      and is_active = true
      and v_event_type = any(events)
  ) loop
    -- 3. Write event to queue
    insert into public.webhook_queue (
      company_id,
      webhook_id,
      event_type,
      payload,
      status
    )
    values (
      v_company_id,
      v_webhook_row.id,
      v_event_type,
      v_payload,
      'pending'
    )
    returning id into v_queue_id;

    -- 4. Call dispatch Edge Function asynchronously
    perform net.http_post(
      url := 'http://kong:8000/functions/v1/dispatch-webhook',
      body := jsonb_build_object('queue_id', v_queue_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
