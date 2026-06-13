begin;
select plan(15);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Impersonate helper
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- Setup fixtures
-- Users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'other-user@test.local');

-- Companies
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '33333333-3333-3333-3333-333333333333');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 5),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'free', 5);

-- Memberships
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

-- Employees
insert into employees (id, company_id, user_id, full_name, status) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Employee A', 'active'),
  ('e2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'Employee B', 'active');

-- Shift in A
insert into shifts (id, company_id, name, start_time, end_time) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Regular', '08:00:00', '17:00:00');

-- Schedule for Monday (DOW = 1)
insert into work_schedules (company_id, employee_id, day_of_week, shift_id, effective_from) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 1, 'f1111111-1111-1111-1111-111111111111', '2026-06-01');

-- Holiday on Wednesday June 3rd
insert into holidays (name, date) values
  ('Test Holiday', '2026-06-03');

-- Run test context as admin
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Insert clock-in and clock-out for Monday June 1st
insert into attendance_records (company_id, employee_id, kind, event_at, is_valid) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', '2026-06-01 08:00:00+07', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_out', '2026-06-01 19:00:00+07', true);

-- Diagnosing what is inside the attendance table and what calculate_overtime_hours sees
select diag('Attendance count for employee: ' || (select count(*)::text from attendance_records where employee_id = 'e1111111-1111-1111-1111-111111111111'));
select diag('Clock-in time: ' || (select event_at::text from attendance_records where employee_id = 'e1111111-1111-1111-1111-111111111111' and kind = 'clock_in'));
select diag('Clock-out time: ' || (select event_at::text from attendance_records where employee_id = 'e1111111-1111-1111-1111-111111111111' and kind = 'clock_out'));
select diag('Clock-in date: ' || (select (event_at::date)::text from attendance_records where employee_id = 'e1111111-1111-1111-1111-111111111111' and kind = 'clock_in'));
select diag('DOW of 2026-06-01: ' || extract(dow from '2026-06-01'::date)::text);
select diag('Schedule shift_id: ' || coalesce((select shift_id::text from work_schedules where employee_id = 'e1111111-1111-1111-1111-111111111111' and day_of_week = 1 and effective_from <= '2026-06-01'), 'NONE'));

select diag('OT minutes: ' || coalesce((select overtime_minutes::text from public.calculate_overtime_hours('e1111111-1111-1111-1111-111111111111', '2026-06-01')), 'NULL'));
select diag('Is rest day: ' || coalesce((select is_rest_day::text from public.calculate_overtime_hours('e1111111-1111-1111-1111-111111111111', '2026-06-01')), 'NULL'));

-- ============================================================================
-- Test 1: Weekday Overtime Calculation
-- ============================================================================
select is(
  (select count(*)::int from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'),
  1,
  'Overtime entry created automatically via trigger'
);

select is(
  (select duration_minutes from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'),
  120,
  'Overtime duration is correct (120 minutes)'
);

select is(
  (select multiplier from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'),
  1.0,
  'Overtime multiplier classification is 1.0 (weekday)'
);

-- ============================================================================
-- Test 2: Admin modify unapproved overtime entries
-- ============================================================================
select lives_ok(
  $$update public.overtime_entries set duration_minutes = 100 where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'$$,
  'Admin can update unapproved overtime entry duration'
);

select is(
  (select duration_minutes from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'),
  100,
  'Overtime duration updated to 100 minutes'
);

-- ============================================================================
-- Test 3: Holiday/Rest Day Overtime Calculation
-- ============================================================================
-- Insert clock-in and clock-out for Wednesday June 3rd (Holiday) (08:00 to 12:00 -> 4 hours = 240 minutes actual. No schedule shift, and holiday, so rest day. All 4 hours are overtime)
insert into attendance_records (company_id, employee_id, kind, event_at, is_valid) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', '2026-06-03 08:00:00+07', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_out', '2026-06-03 12:00:00+07', true);

select is(
  (select duration_minutes from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-03'),
  240,
  'Holiday overtime duration is correct (240 minutes)'
);

select is(
  (select multiplier from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-03'),
  2.0,
  'Holiday overtime multiplier classification is 2.0 (rest-day/holiday)'
);

-- ============================================================================
-- Test 4: Idempotency
-- ============================================================================
-- Running generate_overtime_entries manually should not duplicate or drift
select lives_ok(
  $$select public.generate_overtime_entries('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-06-01')$$,
  'Manual run of generate_overtime_entries succeeds'
);

select is(
  (select count(*)::int from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'),
  1,
  'Idempotent: Only 1 row exists after re-running'
);

-- ============================================================================
-- Test 5: Approved Rows Protection
-- ============================================================================
-- Update the entry back to 100, and approve it
update overtime_entries set duration_minutes = 100, is_approved = true where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01';

-- Update the clock-out to be different (e.g. 20:00 instead of 19:00)
update attendance_records set event_at = '2026-06-01 20:00:00+07' where employee_id = 'e1111111-1111-1111-1111-111111111111' and event_at = '2026-06-01 19:00:00+07';

-- Verify the duration_minutes is NOT updated because the row is approved!
select is(
  (select duration_minutes from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01'),
  100,
  'Approved overtime entry is protected from automatic recalculation'
);

-- ============================================================================
-- Test 6: Correction Flow (Recalculating to 0/Deleting unapproved rows)
-- ============================================================================
-- Delete June 3rd (Holiday, unapproved) clock_out
delete from attendance_records where employee_id = 'e1111111-1111-1111-1111-111111111111' and event_at = '2026-06-03 12:00:00+07';

select is(
  (select count(*)::int from overtime_entries where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-03'),
  0,
  'Unapproved overtime entry deleted automatically when corrected/invalidated to 0 minutes'
);

-- ============================================================================
-- Test 7: RLS Enforcement
-- ============================================================================
-- Impersonate Employee A (regular employee)
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from overtime_entries),
  1,
  'Employee A can see their own overtime entry'
);

-- Employee A tries to approve their own overtime entry -> should fail RLS or write
select throws_ok(
  $$update public.overtime_entries set is_approved = true where date = '2026-06-01'$$,
  '42501', -- Insufficient privilege / RLS block
  NULL,
  'Employee A cannot approve their own overtime entry'
);

-- Impersonate User 3 (Company B owner)
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from overtime_entries where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Company B owner cannot see Company A overtime entries'
);

select throws_ok(
  $$insert into public.overtime_entries (company_id, employee_id, date, duration_minutes, multiplier)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', '2026-06-05', 60, 1.0)$$,
  '42501',
  NULL,
  'Company B owner cannot insert overtime entries into Company A'
);

select * from finish();
rollback;
