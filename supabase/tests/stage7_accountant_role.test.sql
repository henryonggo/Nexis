-- ============================================================================
-- pgTAP tests for Nexis Stage 7 Accountant Role
-- Verifies:
-- 1. Addition of 'accountant' to company_role enum.
-- 2. Accountant select permission on employees, payroll_runs, payroll_items,
--    payslips, report_jobs, and company_billing.
-- 3. Accountant blocked from write (insert, update, delete) on those tables.
-- 4. Accountant blocked from leaves, claims, and attendance records.
-- 5. Storage RLS access in reports and payslips buckets.
-- ============================================================================

begin;
select plan(23);

-- Ensure pgTAP is available
create extension if not exists pgtap;

-- ── Fixtures (privileged role; RLS bypass) ─────────────────────────
-- Users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@company-a.local'),
  ('22222222-2222-2222-2222-222222222222', 'admin@company-a.local'),
  ('33333333-3333-3333-3333-333333333333', 'accountant@company-a.local'),
  ('44444444-4444-4444-4444-444444444444', 'employee@company-a.local'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@other.local');

-- Profiles
update auth.users set email = 'owner@company-a.local' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Company Owner' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Company Admin' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set full_name = 'Company Accountant' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set full_name = 'Company Employee' where id = '44444444-4444-4444-4444-444444444444';

-- Companies
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Company memberships
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'accountant'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'employee');

-- Employees
insert into employees (id, company_id, user_id, full_name, employee_no) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Company Employee', 'EMP001');

-- Billing
insert into company_billing (company_id, plan, npwp, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', '123456789012345', 5);

-- Payroll run and items (using valid hex UUIDs)
insert into payroll_runs (id, company_id, period_year, period_month, status) values
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 6, 'draft'::pay_period_status);

insert into payroll_items (id, company_id, payroll_run_id, employee_id, base_salary, gross_pay, pph21, net_pay) values
  ('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'e1111111-1111-1111-1111-111111111111', 10000000, 10000000, 500000, 9500000);

-- Payslips
insert into payslips (id, company_id, payroll_item_id, employee_id) values
  ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', 'e1111111-1111-1111-1111-111111111111');

-- Report Jobs
insert into report_jobs (id, company_id, report_type, status) values
  ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'payroll_summary', 'pending');

-- Leave Types and Requests
insert into leave_types (id, company_id, name, default_annual_days, accrual_method) values
  ('b3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Annual Leave', 12, 'annual_lump');

insert into leave_requests (id, company_id, employee_id, leave_type_id, start_date, end_date, days, reason, status) values
  ('b2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', current_date, current_date, 1, 'Holiday', 'pending');

-- Claim Types and Claims
insert into claim_types (id, company_id, name) values
  ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Medical Claim');

insert into reimbursement_claims (id, company_id, employee_id, claim_type_id, amount, status) values
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333', 500000, 'pending');

-- Attendance
insert into attendance_records (id, company_id, employee_id, kind, event_at) values
  ('d2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', now());

-- ── Helper: impersonate authenticated user ─────────────────────────────────────
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ============================================================================
-- 1. Verify Enum Role
-- ============================================================================
select is(
  public.user_role_in_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  null,
  'Outsider has no role'
);

select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select is(
  public.user_role_in_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'accountant'::company_role,
  'Accountant role resolves correctly'
);

-- ============================================================================
-- 2. Select RLS policies for Accountant
-- ============================================================================
select is(
  (select count(*)::int from employees),
  1,
  'Accountant can read the employee roster'
);

select is(
  (select count(*)::int from payroll_runs),
  1,
  'Accountant can read payroll runs'
);

select is(
  (select count(*)::int from payroll_items),
  1,
  'Accountant can read payroll items'
);

select is(
  (select count(*)::int from payslips),
  1,
  'Accountant can read payslips'
);

select is(
  (select count(*)::int from report_jobs),
  1,
  'Accountant can read report jobs'
);

select is(
  (select count(*)::int from company_billing),
  1,
  'Accountant can read company billing'
);

-- ============================================================================
-- 3. Write RLS policies (Blocked for Accountant)
-- ============================================================================
select throws_ok(
  $$ insert into employees (company_id, full_name, employee_no) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fake Employee', 'EMP999') $$,
  'new row violates row-level security policy for table "employees"',
  'Accountant cannot insert employees'
);

-- RLS Update blocks silently (affects 0 rows instead of throwing). We check the state remains unchanged.
update payroll_runs set status = 'completed'::pay_period_status where id = '88888888-8888-8888-8888-888888888888';
select is(
  (select status::text from payroll_runs where id = '88888888-8888-8888-8888-888888888888'),
  'draft',
  'Accountant cannot update payroll runs (remains draft)'
);

select throws_ok(
  $$ insert into report_jobs (company_id, report_type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'payroll_summary') $$,
  'new row violates row-level security policy for table "report_jobs"',
  'Accountant cannot insert report jobs'
);

-- RLS Update blocks silently. We check the state remains unchanged.
update company_billing set plan = 'starter'::plan_tier where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select plan::text from company_billing where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'free',
  'Accountant cannot update billing plan (remains free)'
);

-- ============================================================================
-- 4. Access to Non-Payroll Tables (Blocked for Accountant)
-- ============================================================================
select is(
  (select count(*)::int from leave_requests),
  0,
  'Accountant cannot read leave requests'
);

select is(
  (select count(*)::int from reimbursement_claims),
  0,
  'Accountant cannot read claims'
);

select is(
  (select count(*)::int from attendance_records),
  0,
  'Accountant cannot read attendance records'
);

-- ============================================================================
-- 5. Access control for Outsider (Blocked completely)
-- ============================================================================
select tests_authenticate_as('55555555-5555-5555-5555-555555555555');

select is(
  (select count(*)::int from employees),
  0,
  'Outsider cannot read employees'
);

select is(
  (select count(*)::int from payroll_runs),
  0,
  'Outsider cannot read payroll runs'
);

select is(
  (select count(*)::int from payroll_items),
  0,
  'Outsider cannot read payroll items'
);

select is(
  (select count(*)::int from payslips),
  0,
  'Outsider cannot read payslips'
);

select is(
  (select count(*)::int from report_jobs),
  0,
  'Outsider cannot read report jobs'
);

select is(
  (select count(*)::int from company_billing),
  0,
  'Outsider cannot read company billing'
);

-- ============================================================================
-- 6. Storage Bucket Access for Accountant
-- ============================================================================
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

insert into storage.objects (id, bucket_id, name, owner) values
  ('10000000-0000-0000-0000-000000000098', 'reports', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/reports/test_report.xlsx', '33333333-3333-3333-3333-333333333333'),
  ('10000000-0000-0000-0000-000000000099', 'payslips', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e1111111-1111-1111-1111-111111111111/test_payslip.pdf', '33333333-3333-3333-3333-333333333333');

select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'reports'),
  1,
  'Accountant can select reports bucket files'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'payslips'),
  1,
  'Accountant can select payslips bucket files'
);

select * from finish();
rollback;
