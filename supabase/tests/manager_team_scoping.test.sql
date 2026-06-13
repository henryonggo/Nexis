-- ============================================================================
-- pgTAP tests for Manager "Own Team" Scoping (RLS + RPCs)
-- ============================================================================

begin;
select plan(19);

-- Ensure pgTAP is available
create extension if not exists pgtap;

-- ── 1. Setup Fixtures ────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@company-a.local'),
  ('22222222-2222-2222-2222-222222222222', 'manager1@company-a.local'),
  ('33333333-3333-3333-3333-333333333333', 'employee1@company-a.local'),
  ('44444444-4444-4444-4444-444444444444', 'employee2@company-a.local'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@other.local');

-- Companies
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 5);

-- Company members
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'employee'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'employee');

-- Employees setup
-- e_mgr1 = Manager1
-- e_emp1 = Employee1 (report of Manager1)
-- e_emp2 = Employee2 (no manager)
insert into employees (id, company_id, user_id, full_name, manager_id) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Manager One', null),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Employee One', 'e1111111-1111-1111-1111-111111111111'),
  ('e3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Employee Two', null);

-- Leave types
insert into leave_types (id, company_id, name, paid, default_annual_days, accrual_method) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Annual Leave', true, 12, 'monthly');

-- Seed Leave Requests
insert into leave_requests (id, company_id, employee_id, leave_type_id, start_date, end_date, days, status) values
  ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', '2026-06-02', 2, 'pending'),
  ('b2222222-2222-2222-2222-222222222223', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', '2026-06-02', 2, 'pending'),
  ('b3333333-3333-3333-3333-333333333334', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', '2026-06-02', 2, 'pending');

-- Seed Reimbursement Claims
insert into claim_types (id, company_id, name, taxable) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Medical', false);

insert into reimbursement_claims (id, company_id, employee_id, claim_type_id, amount, status) values
  ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 150000, 'pending'),
  ('d2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 250000, 'pending');

-- Seed Attendance Records
insert into attendance_records (id, company_id, employee_id, kind, event_at) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'clock_in', '2026-06-01 09:00:00+00'),
  ('f2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e3333333-3333-3333-3333-333333333333', 'clock_in', '2026-06-01 09:00:00+00'),
  ('f3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', '2026-06-01 09:00:00+00');

-- Seed Overtime Entries
insert into overtime_entries (company_id, employee_id, date, duration_minutes, multiplier, is_approved) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', '2026-06-01', 120, 1.0, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e3333333-3333-3333-3333-333333333333', '2026-06-01', 180, 1.0, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', '2026-06-01', 60, 1.0, false);

-- Helper: impersonate authenticated user
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

create or replace function test_helper_get_duration_minutes(p_employee_id uuid)
returns integer language sql security definer set search_path = public as $$
  select duration_minutes from public.overtime_entries where employee_id = p_employee_id;
$$;

create or replace function test_helper_get_attendance_time(p_employee_id uuid)
returns timestamptz language sql security definer set search_path = public as $$
  select event_at from public.attendance_records where employee_id = p_employee_id;
$$;

-- ── 2. Run Tests ────────────────────────────────────────────────────────────

-- Test 1: Helper function presence
select has_function('public', 'user_can_manage_employee', array['uuid'], 'Helper user_can_manage_employee exists');

-- Test 2-3: Helper check for owner
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is(public.user_can_manage_employee('e2222222-2222-2222-2222-222222222222'), true, 'Owner can manage report');
select is(public.user_can_manage_employee('e3333333-3333-3333-3333-333333333333'), true, 'Owner can manage non-report');

-- Test 4-5: Helper check for manager
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(public.user_can_manage_employee('e2222222-2222-2222-2222-222222222222'), true, 'Manager can manage direct report');
select is(public.user_can_manage_employee('e3333333-3333-3333-3333-333333333333'), false, 'Manager cannot manage non-report');

-- Test 6-9: RLS Select checks for Manager
-- Overtime entries:
select is(
  (select count(*)::int from overtime_entries),
  2, -- direct report + self
  'Manager sees report overtime and self overtime only'
);

-- Attendance:
select is(
  (select count(*)::int from attendance_records),
  2, -- direct report + self
  'Manager sees report attendance and self attendance only'
);

-- Leave requests:
select is(
  (select count(*)::int from leave_requests),
  2, -- direct report + self
  'Manager sees report leave and self leave only'
);

-- Reimbursement claims:
select is(
  (select count(*)::int from reimbursement_claims),
  1, -- direct report only (manager has no claim seeded)
  'Manager sees report claim only'
);

-- Test 10-13: RLS Update/Correction checks for Manager
-- Can update report overtime
select lives_ok(
  $$ update public.overtime_entries set duration_minutes = 130 where employee_id = 'e2222222-2222-2222-2222-222222222222' $$,
  'Manager can update overtime for report'
);
-- Cannot update non-report overtime
update public.overtime_entries set duration_minutes = 200 where employee_id = 'e3333333-3333-3333-3333-333333333333';
select is(
  test_helper_get_duration_minutes('e3333333-3333-3333-3333-333333333333'),
  180,
  'Manager is blocked from updating overtime for non-report'
);
-- Can update report attendance
select lives_ok(
  $$ update public.attendance_records set event_at = '2026-06-01 09:30:00+00' where employee_id = 'e2222222-2222-2222-2222-222222222222' $$,
  'Manager can correct attendance for report'
);
-- Cannot update non-report attendance
update public.attendance_records set event_at = '2026-06-01 09:30:00+00' where employee_id = 'e3333333-3333-3333-3333-333333333333';
select is(
  test_helper_get_attendance_time('e3333333-3333-3333-3333-333333333333'),
  '2026-06-01 09:00:00+00'::timestamptz,
  'Manager is blocked from correcting attendance for non-report'
);

-- Test 14-21: RPC Approval checks for Manager
-- Can approve report leave
select lives_ok(
  $$ select public.approve_leave('b1111111-1111-1111-1111-111111111111') $$,
  'Manager can approve leave request for report'
);
-- Cannot approve non-report leave
select throws_ok(
  $$ select public.approve_leave('b2222222-2222-2222-2222-222222222223') $$,
  'Unauthorized to approve leave requests for this company',
  'Manager is blocked from approving leave request for non-report'
);
-- Cannot approve self leave
select throws_ok(
  $$ select public.approve_leave('b3333333-3333-3333-3333-333333333334') $$,
  'Unauthorized to approve leave requests for this company',
  'Manager is blocked from approving own leave request'
);

-- Can approve report claim
select lives_ok(
  $$ select public.approve_claim('d1111111-1111-1111-1111-111111111111') $$,
  'Manager can approve claim for report'
);
-- Cannot approve non-report claim
select throws_ok(
  $$ select public.approve_claim('d2222222-2222-2222-2222-222222222222') $$,
  'Unauthorized to approve claims for this company',
  'Manager is blocked from approving claim for non-report'
);

-- Cannot approve own overtime (self-approval block)
select throws_ok(
  $$ update public.overtime_entries set is_approved = true where employee_id = 'e1111111-1111-1111-1111-111111111111' $$,
  '42501',
  NULL,
  'Manager is blocked from approving own overtime'
);

-- Clean up
select * from finish();
rollback;
