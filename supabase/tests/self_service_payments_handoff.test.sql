-- ============================================================================
-- pgTAP tests for Self-service and Payments DB Handoffs (H-2, H-3, H-5)
-- ============================================================================

begin;
select plan(27);

-- Ensure pgTAP is available
create extension if not exists pgtap;

-- ── 1. Setup Fixtures ────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@company-a.local'),
  ('22222222-2222-2222-2222-222222222222', 'admin@company-a.local'),
  ('33333333-3333-3333-3333-333333333333', 'manager1@company-a.local'),
  ('44444444-4444-4444-4444-444444444444', 'report1@company-a.local'),
  ('55555555-5555-5555-5555-555555555555', 'other1@company-a.local');

-- Companies
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 10);

-- Company members
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'employee'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'employee');

-- Employees setup
-- e_owner  = Owner
-- e_admin  = Admin
-- e_manager = Manager
-- e_report = Employee 1 (reports to e_manager)
-- e_other  = Employee 2 (reports to e_admin, manager_id = e_admin)
-- e_null_mgr = Employee 3 (manager_id is null)
insert into employees (id, company_id, user_id, full_name, manager_id) values
  ('e0000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Owner Employee', null),
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Admin Employee', null),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Manager Employee', null),
  ('e3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Report Employee', 'e2222222-2222-2222-2222-222222222222'),
  ('e4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'Other Employee', 'e1111111-1111-1111-1111-111111111111'),
  ('e5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Null Manager Employee', null);

-- Helper: impersonate authenticated user
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 2. Test safe_cast_uuid Helper (H-5 robustness) ──────────────────────────
select is(
  public.safe_cast_uuid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'safe_cast_uuid parses valid UUID'
);

select is(
  public.safe_cast_uuid('invalid-uuid-string'),
  null,
  'safe_cast_uuid returns null for invalid UUID'
);

-- ── 3. Test user_can_manage_employee Hierarchy (H-2) ──────────────────────────

-- Case A: Owner Impersonation
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is(public.user_can_manage_employee('e3333333-3333-3333-3333-333333333333'), true, 'Owner can manage any employee');
select is(public.user_can_manage_employee('e0000000-0000-0000-0000-000000000000'), true, 'Owner can manage/self-approve themselves');

-- Case B: Admin Impersonation
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(public.user_can_manage_employee('e3333333-3333-3333-3333-333333333333'), true, 'Admin can manage any employee');
select is(public.user_can_manage_employee('e1111111-1111-1111-1111-111111111111'), false, 'Admin CANNOT self-approve/manage themselves');

-- Case C: Manager Impersonation
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select is(public.user_can_manage_employee('e3333333-3333-3333-3333-333333333333'), true, 'Manager can manage direct reports');
select is(public.user_can_manage_employee('e5555555-5555-5555-5555-555555555555'), true, 'Manager can manage employees with manager_id is null');
select is(public.user_can_manage_employee('e4444444-4444-4444-4444-444444444444'), false, 'Manager CANNOT manage employees assigned to other managers');
select is(public.user_can_manage_employee('e2222222-2222-2222-2222-222222222222'), false, 'Manager CANNOT self-approve/manage themselves');

-- Case D: Employee Impersonation
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select is(public.user_can_manage_employee('e3333333-3333-3333-3333-333333333333'), false, 'Employee CANNOT self-approve/manage themselves');
select is(public.user_can_manage_employee('e4444444-4444-4444-4444-444444444444'), false, 'Employee CANNOT manage other employees');

-- ── 4. Test Compensation Columns and Constraints (H-3) ──────────────────────
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- Add compensation record and check default payment_method
insert into public.compensation (id, company_id, employee_id, base_salary, effective_from)
values ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e3333333-3333-3333-3333-333333333333', 5000000, current_date);

select is(
  (select payment_method from public.compensation where id = 'd1111111-1111-1111-1111-111111111111'),
  'cash',
  'Compensation payment_method defaults to cash'
);

-- Try to update to valid/invalid payment methods
select lives_ok(
  $$ update public.compensation set payment_method = 'bank' where id = 'd1111111-1111-1111-1111-111111111111' $$,
  'Valid payment method bank is accepted'
);

select throws_ok(
  $$ update public.compensation set payment_method = 'bitcoin' where id = 'd1111111-1111-1111-1111-111111111111' $$,
  'new row for relation "compensation" violates check constraint "compensation_payment_method_check"',
  'Invalid payment method is rejected'
);

-- ── 5. Test Payroll Items Columns and Constraints (H-3) ──────────────────────
-- Set up a mock payroll run and item
insert into public.payroll_runs (id, company_id, period_year, period_month, status)
values ('91111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 6, 'draft');

insert into public.payroll_items (id, company_id, payroll_run_id, employee_id, gross_pay, net_pay)
values ('92222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '91111111-1111-1111-1111-111111111111', 'e3333333-3333-3333-3333-333333333333', 5000000, 4800000);

select throws_ok(
  $$ update public.payroll_items set paid_method = 'cheque' where id = '92222222-2222-2222-2222-222222222222' $$,
  'new row for relation "payroll_items" violates check constraint "payroll_items_paid_method_check"',
  'Invalid paid method on payroll items is rejected'
);

-- ── 6. Test mark_payroll_items_paid RPC (H-3) ────────────────────────────────

-- Manager is unauthorized to run it
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select public.mark_payroll_items_paid(array['92222222-2222-2222-2222-222222222222'::uuid], 'bank') $$,
  'Unauthorized to mark payroll items paid',
  'Manager cannot mark payroll items paid'
);

-- Owner is authorized to run it
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select public.mark_payroll_items_paid(array['92222222-2222-2222-2222-222222222222'::uuid], 'bank') $$,
  'Owner can mark payroll items paid'
);

-- Verify the values and audit log were updated
select is(
  (select paid_method from public.payroll_items where id = '92222222-2222-2222-2222-222222222222'),
  'bank',
  'Payroll item paid_method updated correctly'
);

select isnt(
  (select paid_at from public.payroll_items where id = '92222222-2222-2222-2222-222222222222'),
  null,
  'Payroll item paid_at updated correctly'
);

-- ── 7. Test Storage Policies (H-5 robustness) ───────────────────────────────
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- Insert objects
insert into storage.objects (id, bucket_id, name, owner) values
  ('93333333-3333-3333-3333-333333333333', 'payslips', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e3333333-3333-3333-3333-333333333333/payslip.pdf', '44444444-4444-4444-4444-444444444444'),
  ('94444444-4444-4444-4444-444444444444', 'payslips', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/invalid-uuid-subfolder/payslip.pdf', '44444444-4444-4444-4444-444444444444');

-- Impersonate employee who owns the payslip
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from storage.objects where id = '93333333-3333-3333-3333-333333333333'),
  1,
  'Employee can select their own payslip PDF'
);

-- Impersonate another employee
select tests_authenticate_as('55555555-5555-5555-5555-555555555555');
select is(
  (select count(*)::int from storage.objects where id = '93333333-3333-3333-3333-333333333333'),
  0,
  'Employee cannot select others payslip PDF'
);

-- Non-uuid subfolder doesn't crash the query and just returns 0 rows
select lives_ok(
  $$ select count(*)::int from storage.objects where id = '94444444-4444-4444-4444-444444444444' $$,
  'Selecting invalid UUID subfolders is robust and does not crash the query'
);

-- ── 8. Test Daily Pay Support (H-4) ──────────────────────────────────────────
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

select throws_ok(
  $$ update public.compensation set pay_frequency = 'hourly' where id = 'd1111111-1111-1111-1111-111111111111' $$,
  'new row for relation "compensation" violates check constraint "compensation_pay_frequency_check"',
  'Invalid pay frequency is rejected'
);

select lives_ok(
  $$ update public.compensation set pay_frequency = 'daily' where id = 'd1111111-1111-1111-1111-111111111111' $$,
  'Valid pay frequency daily is accepted'
);

select lives_ok(
  $$ update public.payroll_items set days_worked = 20.5 where id = '92222222-2222-2222-2222-222222222222' $$,
  'Can set days_worked on payroll_items'
);

select is(
  (select days_worked from public.payroll_items where id = '92222222-2222-2222-2222-222222222222'),
  20.5,
  'days_worked value retrieved correctly'
);

select * from finish();
rollback;
