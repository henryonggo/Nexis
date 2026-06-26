-- ============================================================================
-- pgTAP tests for Nexis Stage 7: Salary Earnings (allowances, daily/mixed, manual deductions)
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(31);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Clean up any existing data in tables to ensure test isolation
truncate public.custom_earning_types cascade;
truncate public.employee_manual_deduction cascade;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'manager-a@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'employee-b@test.local'), -- Company B employee
  ('55555555-5555-5555-5555-555555555555', 'owner-b@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '55555555-5555-5555-5555-555555555555');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'manager'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'employee'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');

-- Employees mapping.
insert into employees (id, company_id, user_id, full_name, status) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Emp A1', 'active'),
  ('e2000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'Emp B1', 'active');

-- Company settings default creation (to verify default value)
insert into company_settings (company_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  on conflict (company_id) do nothing;

-- ── 1. Constraint Verification ───────────────────────────────────────────────

-- Verify pay_frequency check allows mixed
insert into compensation (company_id, employee_id, base_salary, pay_frequency) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1000000-0000-0000-0000-000000000001', 5000000, 'mixed')
  on conflict do nothing;

select is(
  (select pay_frequency from compensation where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  'mixed',
  'compensation pay_frequency constraint allows mixed'
);

-- Verify compensation work_days constraint limits values to 1-7
select lives_ok(
  $$ update compensation set work_days = array[1,2,3,4,5] where employee_id = 'e1000000-0000-0000-0000-000000000001' $$,
  'compensation.work_days allows valid weekday array'
);

select throws_ok(
  $$ update compensation set work_days = array[0,1,2,3,4] where employee_id = 'e1000000-0000-0000-0000-000000000001' $$,
  'new row for relation "compensation" violates check constraint "compensation_work_days_check"',
  'compensation.work_days rejects arrays containing invalid weekdays (0)'
);

select throws_ok(
  $$ update compensation set work_days = array[1,2,3,4,8] where employee_id = 'e1000000-0000-0000-0000-000000000001' $$,
  'new row for relation "compensation" violates check constraint "compensation_work_days_check"',
  'compensation.work_days rejects arrays containing invalid weekdays (8)'
);

-- Verify company_settings work_days default and constraint
select is(
  (select work_days from company_settings where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  array[1,2,3,4,5],
  'company_settings.work_days defaults to Monday-Friday'
);

select throws_ok(
  $$ update company_settings set work_days = array[7,8] where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'new row for relation "company_settings" violates check constraint "company_settings_work_days_check"',
  'company_settings.work_days rejects invalid weekdays'
);


-- ── 2. custom_earning_types RLS ──────────────────────────────────────────────

-- Authenticate as owner-a
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Insert custom earning type
select lives_ok(
  $$ insert into custom_earning_types (id, company_id, name, calc, amount, taxable) values
    ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Meal Allowance', 'fixed', 50000, true) $$,
  'Admin/owner can insert custom earning type for their company'
);

-- Select
select is(
  (select count(*)::int from custom_earning_types where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Admin/owner can read their custom earning types'
);

-- Update
select lives_ok(
  $$ update custom_earning_types set amount = 60000 where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'Admin/owner can update custom earning types'
);

-- Authenticate as employee-a (same company)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee can read
select is(
  (select count(*)::int from custom_earning_types where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Employee of same company can read custom earning types'
);

-- Employee cannot insert
select throws_ok(
  $$ insert into custom_earning_types (company_id, name, calc, amount, taxable) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Transport Allowance', 'fixed', 30000, true) $$,
  '42501',
  null,
  'Employee cannot insert custom earning type'
);

-- Employee cannot update (direct write updates 0 rows under RLS)
select lives_ok(
  $$ update custom_earning_types set amount = 70000 where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'Employee update fails silently'
);

-- Authenticate as owner-a to verify amount did not change
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select amount from custom_earning_types where id = 'c1000000-0000-0000-0000-000000000001'),
  60000::bigint,
  'Employee cannot update custom earning type (direct updates are blocked)'
);

-- Authenticate as employee-b (other company)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger cannot read
select is(
  (select count(*)::int from custom_earning_types where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot read other company custom earning types'
);

-- Stranger cannot write
select throws_ok(
  $$ insert into custom_earning_types (company_id, name, calc, amount, taxable) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hacker Allowance', 'fixed', 99999, true) $$,
  '42501',
  null,
  'Stranger cannot write to other company custom earning types'
);


-- ── 3. earning_groups and earning_group_items RLS ────────────────────────────

-- Authenticate as owner-a
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Insert earning group (using a valid UUID format starting with d1000000)
select lives_ok(
  $$ insert into earning_groups (id, company_id, name, description) values
    ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Full-time allowances', 'Standard allowances for FT staff') $$,
  'Admin/owner can insert earning group'
);

-- Insert earning group items
select lives_ok(
  $$ insert into earning_group_items (company_id, group_id, custom_type_id) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$,
  'Admin/owner can insert earning group items'
);

-- Authenticate as employee-a
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee can select
select is(
  (select count(*)::int from earning_groups where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Employee can select earning groups'
);

-- Employee cannot insert earning group items
select throws_ok(
  $$ insert into earning_group_items (company_id, group_id, custom_type_id) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'Employee cannot insert earning group items'
);


-- ── 4. employee_earning_group and employee_earning RLS ───────────────────────

-- Authenticate as owner-a
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Assign group to employee
select lives_ok(
  $$ insert into employee_earning_group (employee_id, company_id, group_id) values
    ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000001') $$,
  'Admin/owner can assign earning group to employee'
);

-- Insert manual employee earning
select lives_ok(
  $$ insert into employee_earning (company_id, employee_id, custom_type_id, amount_override) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 55000) $$,
  'Admin/owner can set manual employee earning with override'
);

-- Authenticate as employee-a (self)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee can read self earning group
select is(
  (select count(*)::int from employee_earning_group where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Employee can read their own earning group assignment'
);

-- Employee can read self manual earning
select is(
  (select count(*)::int from employee_earning where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Employee can read their own manual earnings'
);

-- Employee cannot modify manual earning (direct write updates 0 rows under RLS)
select lives_ok(
  $$ update employee_earning set amount_override = 80000 where employee_id = 'e1000000-0000-0000-0000-000000000001' $$,
  'Employee manual earning update fails silently'
);

-- Authenticate as owner-a to verify amount_override did not change
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select amount_override from employee_earning where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  55000::bigint,
  'Employee cannot update their own manual earnings override'
);

-- Authenticate as employee-b (stranger)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger cannot read
select is(
  (select count(*)::int from employee_earning where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  0,
  'Stranger cannot read employee manual earnings'
);


-- ── 5. employee_manual_deduction RLS ─────────────────────────────────────────

-- Authenticate as owner-a
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Insert manual deduction
select lives_ok(
  $$ insert into employee_manual_deduction (company_id, employee_id, amount, reason, date) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1000000-0000-0000-0000-000000000001', 150000, 'Absence 2026-06-20', '2026-06-20') $$,
  'Admin/owner can insert employee manual deduction'
);

-- Authenticate as employee-a (self)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee can read self manual deduction
select is(
  (select count(*)::int from employee_manual_deduction where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Employee can read their own manual deductions'
);

-- Employee cannot modify manual deduction (direct write updates 0 rows under RLS)
select lives_ok(
  $$ update employee_manual_deduction set amount = 50000 where employee_id = 'e1000000-0000-0000-0000-000000000001' $$,
  'Employee manual deduction update fails silently'
);

-- Authenticate as owner-a to verify amount did not change
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select amount from employee_manual_deduction where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  150000::bigint,
  'Employee cannot update their own manual deductions'
);

-- Authenticate as employee-b (stranger)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger cannot read manual deduction
select is(
  (select count(*)::int from employee_manual_deduction where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  0,
  'Stranger cannot read employee manual deductions'
);

-- Clean up
rollback;
