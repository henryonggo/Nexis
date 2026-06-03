-- ============================================================================
-- pgTAP tests for Nexis Stage 3 — Attendance & Scheduling database layer.
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(11);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- ── Fixtures (privileged test context) ──────────────────────────────────────
-- Setup users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'other-user@test.local');

-- Setup companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '33333333-3333-3333-3333-333333333333');

-- Memberships: User 1 is owner in A. User 2 is employee in A. User 3 is owner in B.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

-- Setup employee rows.
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Employee A'),
  ('e2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'Employee B');

-- Setup Geofence in Company A (Office A at Latitude 0.0, Longitude 0.0, 100m radius).
insert into geofences (id, company_id, name, latitude, longitude, radius_meters) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Office A', 0.0, 0.0, 100);

-- Setup Shift in Company A.
insert into shifts (id, company_id, name, start_time, end_time, grace_period_minutes) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Regular', '08:00:00', '17:00:00', 15);

-- Setup Schedule for Employee A (Monday, Regular Shift).
insert into work_schedules (company_id, employee_id, day_of_week, shift_id, effective_from) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 1, 'f1111111-1111-1111-1111-111111111111', '2026-06-01');

-- Helper function to authenticate.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ============================================================================
-- 1. Tenant Isolation Tests (as User 3 from Company B)
-- ============================================================================
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

-- 1. Cannot see Company A's geofences.
select is(
  (select count(*)::int from geofences where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Company B owner cannot view Company A geofences'
);

-- 2. Cannot see Company A's shifts.
select is(
  (select count(*)::int from shifts where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Company B owner cannot view Company A shifts'
);

-- 3. Cannot see Company A's work schedules.
select is(
  (select count(*)::int from work_schedules where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Company B owner cannot view Company A work schedules'
);

-- ============================================================================
-- 2. RLS & Geofence Tests (as Employee A from Company A)
-- ============================================================================
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

-- 4. Employee A can select their own company's geofence.
select is(
  (select count(*)::int from geofences where id = 'c1111111-1111-1111-1111-111111111111'),
  1,
  'Employee A can view Company A geofence'
);

-- 5. Employee A can record clock-in inside geofence (matching Lat 0, Lon 0).
select public.record_attendance(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'clock_in',
  0.0,
  0.0,
  'selfie.png'
);

select is(
  (select is_valid from attendance_records where kind = 'clock_in' and latitude = 0.0 limit 1),
  true,
  'Clock-in inside the geofence is recorded as valid'
);

-- 6. Employee A's clock-in outside geofence (Lat 1.0, Lon 1.0) is flagged as invalid.
select public.record_attendance(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'clock_in',
  1.0,
  1.0,
  'selfie.png'
);

select is(
  (select is_valid from attendance_records where kind = 'clock_in' and latitude = 1.0 limit 1),
  false,
  'Clock-in outside the geofence is flagged as invalid'
);

-- 7. Employee A can view their own attendance records.
select is(
  (select count(*)::int from attendance_records where employee_id = 'e1111111-1111-1111-1111-111111111111'),
  2,
  'Employee A can view their own attendance records'
);

-- 8. Employee A cannot view other employee's attendance records (Company B's Employee B).
select is(
  (select count(*)::int from attendance_records where employee_id = 'e2222222-2222-2222-2222-222222222222'),
  0,
  'Employee A cannot view Employee B''s attendance records'
);

-- ============================================================================
-- 3. Overtime Calculations Tests (Weekday Overtime)
-- ============================================================================
select tests_authenticate_as('11111111-1111-1111-1111-111111111111'); -- owner A

-- 9. Insert clock-in and clock-out to simulate 10 hours of work on a Monday (2026-06-01 is a Monday)
-- Shift is 08:00:00 to 17:00:00 (9 hours gross, 8 hours net scheduled).
-- Let's log clock_in at 08:00:00 and clock_out at 18:00:00.
insert into attendance_records (company_id, employee_id, kind, event_at, is_valid) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', '2026-06-01 08:00:00+07', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_out', '2026-06-01 18:00:00+07', true);

-- Calculate overtime:
-- Scheduled net: 480 mins (8 hours)
-- Actual net (minus 60 min break default): 600 - 60 = 540 mins (9 hours)
-- Overtime: 540 - 480 = 60 mins (1 hour)
select is(
  (select overtime_minutes from public.calculate_overtime_hours('e1111111-1111-1111-1111-111111111111', '2026-06-01')),
  60,
  'Overtime calculation correctly outputs 60 minutes for a 9-hour work day'
);

-- ============================================================================
-- 4. Storage selfies Bucket RLS Policies
-- ============================================================================
-- User 3 (Employee B) tries to insert into selfies bucket for Employee A.
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

-- 10. Cannot insert a selfie file targeting Company A / Employee A path.
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
     values ('selfies', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e1111111-1111-1111-1111-111111111111/selfie.png', '33333333-3333-3333-3333-333333333333')$$,
  '42501', -- RLS violation error code
  null,
  'RLS blocks inserting files to another company/employee path'
);

-- Employee A inserting their own selfie to their company/employee path.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

-- 11. Can insert a selfie file targeting their own Company A / Employee A path.
select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, owner)
     values ('f1111111-1111-1111-1111-111111111111', 'selfies', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e1111111-1111-1111-1111-111111111111/selfie.png', '22222222-2222-2222-2222-222222222222')$$,
  'RLS allows inserting files into their own company/employee path'
);

select * from finish();
rollback;
