-- ============================================================================
-- pgTAP tests for attendance liveness validation policy
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(5);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (id, company_id, user_id, role) values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee');

-- Setup employee row.
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Employee A');

-- Setup Shift and Schedule to avoid constraints.
insert into shifts (id, company_id, name, start_time, end_time) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Regular', '08:00:00', '17:00:00');
insert into work_schedules (company_id, employee_id, day_of_week, shift_id, effective_from) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 1, 'f1111111-1111-1111-1111-111111111111', '2026-06-01');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- 1. Insert record with liveness_passed = false -> is_valid should be false and note updated.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
insert into attendance_records (id, company_id, employee_id, kind, event_at, latitude, longitude, liveness_passed) values
  ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', '2026-06-01 08:00:00+00', 0.0, 0.0, false);

select results_eq(
  $$select is_valid from attendance_records where id = 'd1111111-1111-1111-1111-111111111111'$$,
  $$values (false)$$,
  'Attendance record with failed liveness check is marked invalid'
);

select matches(
  (select note from attendance_records where id = 'd1111111-1111-1111-1111-111111111111'),
  '\[Failed liveness check\]',
  'Attendance record note contains failed liveness indicator'
);

-- 2. Insert record with liveness_passed = true -> is_valid should be true.
insert into attendance_records (id, company_id, employee_id, kind, event_at, latitude, longitude, liveness_passed) values
  ('d2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_out', '2026-06-01 17:00:00+00', 0.0, 0.0, true);

select results_eq(
  $$select is_valid from attendance_records where id = 'd2222222-2222-2222-2222-222222222222'$$,
  $$values (true)$$,
  'Attendance record with successful liveness check is valid'
);

-- 3. Insert record with liveness_passed = null, then update to false -> is_valid should become false.
insert into attendance_records (id, company_id, employee_id, kind, event_at, latitude, longitude, liveness_passed) values
  ('d3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', '2026-06-02 08:00:00+00', 0.0, 0.0, null);

-- Authenticate as owner to perform the update
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
update attendance_records set liveness_passed = false where id = 'd3333333-3333-3333-3333-333333333333';

select results_eq(
  $$select is_valid from attendance_records where id = 'd3333333-3333-3333-3333-333333333333'$$,
  $$values (false)$$,
  'Attendance record updated to failed liveness is marked invalid'
);

select matches(
  (select note from attendance_records where id = 'd3333333-3333-3333-3333-333333333333'),
  '\[Failed liveness check\]',
  'Updated attendance record note contains failed liveness indicator'
);

select * from finish();
rollback;
