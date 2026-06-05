-- ============================================================================
-- Nexis — Stage 7 Migration: Performance & KPI
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.goal_status as enum (
  'on_track',
  'at_risk',
  'off_track',
  'done',
  'cancelled'
);

create type public.review_status as enum (
  'draft',
  'submitted',
  'acknowledged'
);

-- ── 1. Review Cycles Table ──────────────────────────────────────────────────
create table public.review_cycles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null check (status in ('draft', 'active', 'closed')) default 'draft',
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index on public.review_cycles(company_id);
create index on public.review_cycles(status);

-- ── 2. Performance Goals Table ──────────────────────────────────────────────
create table public.performance_goals (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  cycle_id     uuid references public.review_cycles(id) on delete set null,
  title        text not null,
  description  text,
  weight       int not null default 0 check (weight between 0 and 100),
  progress     int not null default 0 check (progress between 0 and 100),
  status       public.goal_status not null default 'on_track',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.performance_goals(company_id);
create index on public.performance_goals(employee_id);
create index on public.performance_goals(cycle_id);

-- ── 3. Performance Reviews Table ─────────────────────────────────────────────
create table public.performance_reviews (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  cycle_id         uuid not null references public.review_cycles(id) on delete cascade,
  reviewer_id      uuid references auth.users(id) on delete set null,
  overall_rating   numeric(2,1) check (overall_rating between 1.0 and 5.0),
  summary          text,
  status           public.review_status not null default 'draft',
  submitted_at     timestamptz,
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

create index on public.performance_reviews(company_id);
create index on public.performance_reviews(employee_id);
create index on public.performance_reviews(cycle_id);

-- ── 4. Row Level Security (RLS) ──────────────────────────────────────────────
alter table public.review_cycles enable row level security;
alter table public.performance_goals enable row level security;
alter table public.performance_reviews enable row level security;

-- review_cycles Policies
create policy "review_cycles: select" on public.review_cycles
  for select using (public.user_has_company_access(company_id));

create policy "review_cycles: manager modify" on public.review_cycles
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));

-- performance_goals Policies
create policy "performance_goals: select" on public.performance_goals
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy "performance_goals: insert" on public.performance_goals
  for insert with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));

create policy "performance_goals: update" on public.performance_goals
  for update using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  )
  with check (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

-- performance_reviews Policies
create policy "performance_reviews: select" on public.performance_reviews
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy "performance_reviews: manager modify" on public.performance_reviews
  for all using (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'))
  with check (public.user_role_in_company(company_id) in ('owner', 'admin', 'manager'));

-- ── 5. Realtime Publication Settings ─────────────────────────────────────────
alter publication supabase_realtime add table public.review_cycles;
alter publication supabase_realtime add table public.performance_goals;
alter publication supabase_realtime add table public.performance_reviews;

-- ── 6. SECURITY DEFINER RPC Functions ────────────────────────────────────────

-- submit_review
create or replace function public.submit_review(
  p_review_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_status public.review_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load review details
  select company_id, employee_id, status
  into v_company_id, v_employee_id, v_status
  from public.performance_reviews
  where id = p_review_id;

  if v_company_id is null then
    raise exception 'Performance review not found';
  end if;

  -- Verify manager/admin authority
  if public.user_role_in_company(v_company_id) is null or public.user_role_in_company(v_company_id) not in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to submit reviews for this company';
  end if;

  if v_status != 'draft' then
    raise exception 'Only draft reviews can be submitted';
  end if;

  -- Update review
  update public.performance_reviews
  set status = 'submitted',
      reviewer_id = auth.uid(),
      submitted_at = now()
  where id = p_review_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'submit_review',
    'performance_reviews',
    p_review_id,
    jsonb_build_object('employee_id', v_employee_id)
  );
end;
$$;

-- acknowledge_review
create or replace function public.acknowledge_review(
  p_review_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_status public.review_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load review details
  select company_id, employee_id, status
  into v_company_id, v_employee_id, v_status
  from public.performance_reviews
  where id = p_review_id;

  if v_company_id is null then
    raise exception 'Performance review not found';
  end if;

  -- Verify caller is the reviewee
  if not exists (
    select 1 from public.employees
    where id = v_employee_id and user_id = auth.uid()
  ) then
    raise exception 'Only the reviewee can acknowledge this review';
  end if;

  if v_status != 'submitted' then
    raise exception 'Only submitted reviews can be acknowledged';
  end if;

  -- Update review
  update public.performance_reviews
  set status = 'acknowledged',
      acknowledged_at = now()
  where id = p_review_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'acknowledge_review',
    'performance_reviews',
    p_review_id,
    jsonb_build_object('employee_id', v_employee_id)
  );
end;
$$;
