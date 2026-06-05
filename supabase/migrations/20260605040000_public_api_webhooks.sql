-- ============================================================================
-- Nexis — Stage 7 Migration: Public API & Webhooks
-- ============================================================================

-- Enable pgcrypto extension for digests and key generation
create extension if not exists pgcrypto with schema extensions;

-- Enable pg_net extension for asynchronous HTTP notifications
create extension if not exists pg_net with schema extensions;

-- ── 1. API Keys Table ────────────────────────────────────────────────────────
create table public.company_api_keys (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  key_hash      text not null unique,
  scopes        text[] not null default '{}',
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  last_used_at  timestamptz
);

create index on public.company_api_keys(company_id);
create index on public.company_api_keys(key_hash);

-- ── 2. Webhooks Table ────────────────────────────────────────────────────────
create table public.company_webhooks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  url         text not null,
  secret      text not null,
  events      text[] not null default '{}',
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on public.company_webhooks(company_id);

-- ── 3. API Request Logs Table (for rate limiting) ───────────────────────────
create table public.api_request_logs (
  id          uuid primary key default gen_random_uuid(),
  key_hash    text not null,
  created_at  timestamptz not null default now()
);

create index on public.api_request_logs(key_hash, created_at);

-- ── 4. Webhook Queue Table ───────────────────────────────────────────────────
create table public.webhook_queue (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  webhook_id  uuid not null references public.company_webhooks(id) on delete cascade,
  event_type  text not null,
  payload     jsonb not null,
  status      text not null check (status in ('pending', 'delivered', 'failed')) default 'pending',
  retry_count int not null default 0,
  created_at  timestamptz not null default now()
);

create index on public.webhook_queue(status, created_at);

-- ── 5. Webhook Logs Table (for historical logging) ───────────────────────────
create table public.webhook_logs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  webhook_id      uuid not null references public.company_webhooks(id) on delete cascade,
  event_type      text not null,
  response_status int,
  response_body   text,
  attempt_number  int not null default 1,
  status          text not null check (status in ('success', 'failed')),
  created_at      timestamptz not null default now()
);

create index on public.webhook_logs(company_id);
create index on public.webhook_logs(webhook_id);

-- ── 6. Row Level Security (RLS) ──────────────────────────────────────────────
alter table public.company_api_keys enable row level security;
alter table public.company_webhooks enable row level security;
alter table public.api_request_logs enable row level security;
alter table public.webhook_queue enable row level security;
alter table public.webhook_logs enable row level security;

-- company_api_keys Policies
create policy "company_api_keys: select" on public.company_api_keys
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_api_keys: insert" on public.company_api_keys
  for insert with check (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_api_keys: update" on public.company_api_keys
  for update using (public.user_role_in_company(company_id) in ('owner', 'admin'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_api_keys: delete" on public.company_api_keys
  for delete using (public.user_role_in_company(company_id) in ('owner', 'admin'));

-- company_webhooks Policies
create policy "company_webhooks: select" on public.company_webhooks
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_webhooks: insert" on public.company_webhooks
  for insert with check (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_webhooks: update" on public.company_webhooks
  for update using (public.user_role_in_company(company_id) in ('owner', 'admin'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin'));

create policy "company_webhooks: delete" on public.company_webhooks
  for delete using (public.user_role_in_company(company_id) in ('owner', 'admin'));

-- webhook_logs Policies
create policy "webhook_logs: select" on public.webhook_logs
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin'));

-- ── 7. SECURITY DEFINER RPC Functions ────────────────────────────────────────

-- generate_api_key
create or replace function public.generate_api_key(
  p_company_id uuid,
  p_name text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_raw_key text;
  v_hashed_key text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Verify manager/admin authority
  if public.user_role_in_company(p_company_id) is null or public.user_role_in_company(p_company_id) not in ('owner', 'admin') then
    raise exception 'Unauthorized to generate API keys for this company';
  end if;

  -- Generate secure token prefixing nexis_live_
  v_raw_key := 'nexis_live_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_hashed_key := encode(extensions.digest(v_raw_key, 'sha256'), 'hex');

  -- Insert key hash and details
  insert into public.company_api_keys (
    company_id,
    name,
    key_hash,
    scopes,
    created_by,
    expires_at
  )
  values (
    p_company_id,
    p_name,
    v_hashed_key,
    p_scopes,
    auth.uid(),
    p_expires_at
  );

  return v_raw_key;
end;
$$;

-- ── 8. Webhook Queue Dispatch Trigger ───────────────────────────────────────

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
        'period_start', new.period_start,
        'period_end', new.period_end,
        'status', new.status,
        'updated_at', new.updated_at
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

-- Bind triggers to the tables
create trigger tr_webhook_employee
after insert or update on public.employees
for each row execute function public.process_webhook_events_trigger();

create trigger tr_webhook_attendance
after insert on public.attendance_records
for each row execute function public.process_webhook_events_trigger();

create trigger tr_webhook_payroll
after update on public.payroll_runs
for each row execute function public.process_webhook_events_trigger();
