-- ============================================================================
-- Nexis — Stage 3 migration: Attendance & Scheduling
-- Geofences, Shifts, Work Schedules, Attendance, Holidays, Overtime
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type attendance_kind as enum ('clock_in', 'clock_out', 'break_start', 'break_end');

-- ── geofences (Tenant geofence locations) ────────────────────────────────────
create table geofences (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  latitude      double precision not null,
  longitude     double precision not null,
  radius_meters integer not null default 100 check (radius_meters > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on geofences(company_id);

-- ── shifts (Tenant shifts) ──────────────────────────────────────────────────
create table shifts (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  name                 text not null,
  start_time           time not null,
  end_time             time not null,
  grace_period_minutes integer not null default 15 check (grace_period_minutes >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on shifts(company_id);

-- ── work_schedules (Weekly shift rosters for employees) ──────────────────────
create table work_schedules (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  day_of_week    integer not null check (day_of_week >= 0 and day_of_week <= 6),
  shift_id       uuid references shifts(id) on delete set null,
  effective_from date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, day_of_week, effective_from)
);
create index on work_schedules(employee_id);
create index on work_schedules(company_id);

-- ── holidays (Global holiday lookup table) ──────────────────────────────────
create table holidays (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  name        text not null,
  is_national boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on holidays(date);

-- ── attendance_records (Clock logs) ──────────────────────────────────────────
create table attendance_records (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  kind        attendance_kind not null,
  event_at    timestamptz not null default now(),
  latitude    double precision,
  longitude   double precision,
  selfie_url  text,
  is_valid    boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
create index on attendance_records(employee_id);
create index on attendance_records(company_id);
create index on attendance_records(event_at);

-- ── overtime_entries (Computed overtime logs) ───────────────────────────────
create table overtime_entries (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete cascade,
  date             date not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  multiplier       numeric(3,1) not null check (multiplier >= 1.0),
  is_approved      boolean not null default false,
  approved_by      uuid references employees(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on overtime_entries(employee_id);
create index on overtime_entries(company_id);
create index on overtime_entries(date);

-- ── Row Level Security (RLS) policies ────────────────────────────────────────
alter table geofences enable row level security;
alter table shifts enable row level security;
alter table work_schedules enable row level security;
alter table holidays enable row level security;
alter table attendance_records enable row level security;
alter table overtime_entries enable row level security;

-- 1. geofences
create policy "geofences: select" on geofences
  for select using (public.user_has_company_access(company_id));
create policy "geofences: admin modify" on geofences
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- 2. shifts
create policy "shifts: select" on shifts
  for select using (public.user_has_company_access(company_id));
create policy "shifts: admin modify" on shifts
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- 3. work_schedules
create policy "work_schedules: select" on work_schedules
  for select using (public.user_has_company_access(company_id));
create policy "work_schedules: admin modify" on work_schedules
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- 4. holidays (global, read-only to all authenticated users)
create policy "holidays: select" on holidays
  for select using (auth.role() = 'authenticated');

-- 5. attendance_records
create policy "attendance: select" on attendance_records
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "attendance: insert" on attendance_records
  for insert with check (
    employee_id in (
      select id from public.employees where user_id = auth.uid() and company_id = attendance_records.company_id
    )
  );
create policy "attendance: admin modify" on attendance_records
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- 6. overtime_entries
create policy "overtime: select" on overtime_entries
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );
create policy "overtime: admin modify" on overtime_entries
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- ── Selfie Storage Bucket Configuration ─────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict (id) do nothing;

create policy "selfies: select" on storage.objects
  for select using (
    bucket_id = 'selfies'
    and (
      auth.uid() = owner
      or public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
    )
  );

create policy "selfies: insert" on storage.objects
  for insert with check (
    bucket_id = 'selfies'
    and auth.uid() = owner
    and public.user_has_company_access(cast(split_part(name, '/', 1) as uuid))
    and exists (
      select 1 from public.employees
      where id = cast(split_part(name, '/', 2) as uuid)
        and user_id = auth.uid()
    )
  );

-- ── RLS Triggers and Helper Functions ───────────────────────────────────────

-- Haversine formula based geofence validator trigger
create or replace function public.validate_attendance_geofence()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_geofence_matched boolean := false;
  v_geo_rec record;
  v_distance double precision;
begin
  if not new.is_valid then
    return new;
  end if;

  if not exists (
    select 1 from public.employees
    where id = new.employee_id and company_id = new.company_id
  ) then
    raise exception 'Employee does not belong to the specified company';
  end if;

  if new.latitude is not null and new.longitude is not null then
    for v_geo_rec in (
      select latitude, longitude, radius_meters
      from public.geofences
      where company_id = new.company_id
    ) loop
      v_distance := 6371000 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(new.latitude)) * cos(radians(v_geo_rec.latitude)) *
          cos(radians(v_geo_rec.longitude) - radians(new.longitude)) +
          sin(radians(new.latitude)) * sin(radians(v_geo_rec.latitude))
        ))
      );

      if v_distance <= v_geo_rec.radius_meters then
        v_geofence_matched := true;
        exit;
      end if;
    end loop;

    if exists (select 1 from public.geofences where company_id = new.company_id) and not v_geofence_matched then
      new.is_valid := false;
      new.note := coalesce(new.note, '') || ' [Out of geofence area]';
    end if;
  else
    if exists (select 1 from public.geofences where company_id = new.company_id) then
      new.is_valid := false;
      new.note := coalesce(new.note, '') || ' [Missing location coordinates]';
    end if;
  end if;

  return new;
end; $$;

create trigger trg_validate_attendance_geofence
  before insert on attendance_records
  for each row execute function public.validate_attendance_geofence();

-- ── record_attendance RPC ───────────────────────────────────────────────────
create or replace function public.record_attendance(
  p_company_id uuid,
  p_kind attendance_kind,
  p_latitude double precision,
  p_longitude double precision,
  p_selfie_url text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_employee_id uuid;
  v_record_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_employee_id
  from public.employees
  where company_id = p_company_id and user_id = auth.uid();

  if v_employee_id is null then
    raise exception 'EMPLOYEE_NOT_FOUND' using detail = 'User is not mapped as an employee of this company';
  end if;

  insert into public.attendance_records (
    company_id,
    employee_id,
    kind,
    event_at,
    latitude,
    longitude,
    selfie_url,
    is_valid,
    note
  ) values (
    p_company_id,
    v_employee_id,
    p_kind,
    now(),
    p_latitude,
    p_longitude,
    p_selfie_url,
    true, -- trigger will evaluate actual geofence validity
    p_note
  ) returning id into v_record_id;

  return v_record_id;
end; $$;

grant execute on function public.record_attendance(uuid, attendance_kind, double precision, double precision, text, text) to authenticated;

-- ── calculate_overtime_hours Helper Function ────────────────────────────────
create or replace function public.calculate_overtime_hours(
  p_employee_id uuid,
  p_date date
)
returns table (
  actual_work_minutes integer,
  scheduled_minutes integer,
  overtime_minutes integer,
  is_rest_day boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_day_of_week integer;
  v_shift_id uuid;
  v_shift_start time;
  v_shift_end time;
  
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_actual_minutes integer := 0;
  v_sched_minutes integer := 0;
  v_ot_minutes integer := 0;
  v_is_rest_day boolean := false;
  v_is_holiday boolean := false;
begin
  select company_id into v_company_id from public.employees where id = p_employee_id;
  v_day_of_week := extract(dow from p_date);
  
  select shift_id into v_shift_id
  from public.work_schedules
  where employee_id = p_employee_id
    and day_of_week = v_day_of_week
    and effective_from <= p_date
  order by effective_from desc
  limit 1;
  
  if v_shift_id is not null then
    select start_time, end_time into v_shift_start, v_shift_end
    from public.shifts
    where id = v_shift_id;
    
    v_sched_minutes := extract(epoch from (v_shift_end - v_shift_start)) / 60;
    if v_sched_minutes >= 300 then
      v_sched_minutes := v_sched_minutes - 60; -- 1 hour break
    end if;
  else
    v_is_rest_day := true;
  end if;
  
  if exists (select 1 from public.holidays where date = p_date) then
    v_is_holiday := true;
    v_is_rest_day := true;
  end if;
  
  select event_at into v_clock_in
  from public.attendance_records
  where employee_id = p_employee_id
    and event_at::date = p_date
    and kind = 'clock_in'
  order by event_at asc
  limit 1;
  
  select event_at into v_clock_out
  from public.attendance_records
  where employee_id = p_employee_id
    and event_at::date = p_date
    and kind = 'clock_out'
  order by event_at desc
  limit 1;
  
  if v_clock_in is not null and v_clock_out is not null and v_clock_out > v_clock_in then
    v_actual_minutes := extract(epoch from (v_clock_out - v_clock_in)) / 60;
    
    declare
      v_break_duration integer := 0;
    begin
      select coalesce(sum(extract(epoch from (e.event_at - s.event_at)) / 60), 0) into v_break_duration
      from public.attendance_records s
      join public.attendance_records e on s.employee_id = e.employee_id and s.event_at::date = e.event_at::date
      where s.employee_id = p_employee_id
        and s.event_at::date = p_date
        and s.kind = 'break_start'
        and e.kind = 'break_end'
        and e.event_at > s.event_at;
        
      if v_break_duration > 0 then
        v_actual_minutes := v_actual_minutes - v_break_duration;
      else
        if v_actual_minutes >= 300 then
          v_actual_minutes := v_actual_minutes - 60;
        end if;
      end if;
    end;
  end if;
  
  if v_is_rest_day or v_is_holiday then
    v_ot_minutes := v_actual_minutes;
  else
    if v_actual_minutes > v_sched_minutes then
      v_ot_minutes := v_actual_minutes - v_sched_minutes;
    end if;
  end if;
  
  return query select v_actual_minutes, v_sched_minutes, v_ot_minutes, v_is_rest_day;
end; $$;

grant execute on function public.calculate_overtime_hours(uuid, date) to authenticated;
