-- Migration: Leave Request Push Notifications Trigger
-- Date: 2026-06-17

-- 1. Create trigger function to process leave request submission notifications
create or replace function public.on_leave_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipients jsonb;
begin
  -- Resolve user IDs of owners, admins, managers in the company, excluding the applicant
  select jsonb_agg(user_id) into v_recipients
  from (
    select cm.user_id from public.company_members cm
    where cm.company_id = new.company_id
      and cm.role in ('owner', 'admin', 'manager')
      and cm.user_id != (select e.user_id from public.employees e where e.id = new.employee_id)
  ) sub;

  -- Call send-notification Edge Function if there are recipients
  if v_recipients is not null and jsonb_array_length(v_recipients) > 0 then
    perform net.http_post(
      url := 'http://kong:8000/functions/v1/send-notification',
      body := jsonb_build_object(
        'event', 'leave_submitted',
        'companyId', new.company_id,
        'leaveRequestId', new.id,
        'recipientUserIds', v_recipients
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  return new;
end;
$$;

-- 2. Bind trigger to leave_requests table
create trigger tr_leave_request_submitted
  after insert on public.leave_requests
  for each row execute function public.on_leave_request_submitted();
