-- ============================================================================
-- pgTAP tests for Nexis Stage 7: Employee Loans & Advances (Kasbon) RLS & RPCs
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(22);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Clean up any existing data in tables to ensure test isolation
truncate public.employee_loans cascade;

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

-- ── 1. RPC test: request_loan ───────────────────────────────────────────────

-- Authenticate as owner-a
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Request loan
select lives_ok(
  $$ select public.request_loan('e1000000-0000-0000-0000-000000000001', 3000000, 3, 'Cicilan motor') $$,
  'Owner of Company A can request loan for Company A employee'
);

-- Store loan ID
select id as loan_id_fixture from public.employee_loans where employee_id = 'e1000000-0000-0000-0000-000000000001' \gset

-- Verify loan is pending and installment_amount is computed (3,000,000 / 3 = 1,000,000)
select is(status, 'pending', 'Requested loan is pending') from public.employee_loans where id = :'loan_id_fixture';
select is(installment_amount, 1000000::bigint, 'Installment amount is calculated and rounded correctly') from public.employee_loans where id = :'loan_id_fixture';

-- Authenticate as employee-b (stranger to Company A)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger tries to request loan for Company A employee
select throws_ok(
  $$ select public.request_loan('e1000000-0000-0000-0000-000000000001', 3000000, 3, 'Stranger request') $$,
  'Unauthorized to request loan for this employee',
  'Stranger cannot request loan for another company employee'
);

-- ── 2. RLS select policies ──────────────────────────────────────────────────

-- Owner-a can select Company A loans
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.employee_loans where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Owner-a can select Company A loans'
);

-- Employee-a can select their own loans
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.employee_loans where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Employee-a can select their own loans'
);

-- Employee-b (stranger to Company A) cannot select Company A loans
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.employee_loans where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot select Company A loans'
);

-- ── 3. Direct writes blocker test (no direct client insert/update) ───────────

-- Employee-a tries to update loan directly (this should affect 0 rows because no update policy exists)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
update public.employee_loans set status = 'approved' where id = :'loan_id_fixture';

-- Authenticate as owner-a to verify status did not change
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select status from public.employee_loans where id = :'loan_id_fixture'),
  'pending'::public.loan_status,
  'Direct status updates are blocked by RLS'
);

-- ── 4. RPC test: reject_loan ────────────────────────────────────────────────

-- Authenticate as manager-a
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

-- Reject loan
select lives_ok(
  format('select public.reject_loan(%L, ''Alasan penolakan: cicilan terlalu besar'')', :'loan_id_fixture'),
  'Manager-a can reject Company A loan request'
);

select is(status, 'rejected', 'Loan is marked as rejected') from public.employee_loans where id = :'loan_id_fixture';
select is(decision_note, 'Alasan penolakan: cicilan terlalu besar', 'Decision note is saved on reject') from public.employee_loans where id = :'loan_id_fixture';

-- ── 5. RPC test: approve_loan ────────────────────────────────────────────────

-- Reset loan status back to pending to test approval (as postgres admin)
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
update public.employee_loans set status = 'pending' where id = :'loan_id_fixture';

-- Re-authenticate as owner-a
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Approve loan
select lives_ok(
  format('select public.approve_loan(%L)', :'loan_id_fixture'),
  'Owner-a can approve Company A loan request'
);

select is(status, 'active', 'Approved loan becomes active') from public.employee_loans where id = :'loan_id_fixture';
select is(
  (select count(*)::int from public.loan_installments where loan_id = :'loan_id_fixture'),
  3,
  'Approve loan automatically generates 3 installment schedule items'
);

-- Verify sequence and amounts of generated installments
select is(amount, 1000000::bigint, 'Installment 1 is 1,000,000') from public.loan_installments where loan_id = :'loan_id_fixture' and sequence = 1;
select is(amount, 1000000::bigint, 'Installment 2 is 1,000,000') from public.loan_installments where loan_id = :'loan_id_fixture' and sequence = 2;
select is(amount, 1000000::bigint, 'Installment 3 is 1,000,000') from public.loan_installments where loan_id = :'loan_id_fixture' and sequence = 3;

-- ── 6. Trigger next_due and status tests ─────────────────────────────────────

-- Verify next due date is set on loan (should match installment 1)
select is(
  (select next_due_year from public.employee_loans where id = :'loan_id_fixture'), 
  (select due_year from public.loan_installments where loan_id = :'loan_id_fixture' and sequence = 1), 
  'Loan next_due_year is initialized to installment 1 year'
);
select is(
  (select next_due_month from public.employee_loans where id = :'loan_id_fixture'), 
  (select due_month from public.loan_installments where loan_id = :'loan_id_fixture' and sequence = 1), 
  'Loan next_due_month is initialized to installment 1 month'
);

-- Switch to postgres role to simulate backend worker / trigger execution
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- Update first installment to deducted
update public.loan_installments set status = 'deducted' where loan_id = :'loan_id_fixture' and sequence = 1;

-- Verify next due has moved to installment 2
select is(
  (select next_due_month from public.employee_loans where id = :'loan_id_fixture'), 
  (select due_month from public.loan_installments where loan_id = :'loan_id_fixture' and sequence = 2), 
  'Loan next due month moves to installment 2 after installment 1 is deducted'
);

-- Update remaining installments to deducted
update public.loan_installments set status = 'deducted' where loan_id = :'loan_id_fixture' and sequence in (2, 3);

-- Verify loan next due is now null and status has flipped to settled
select is(
  (select next_due_month from public.employee_loans where id = :'loan_id_fixture'), 
  null, 
  'Loan next due is null when all installments are deducted'
);
select is(status, 'settled', 'Loan status automatically flips to settled when all installments are deducted') from public.employee_loans where id = :'loan_id_fixture';

-- Clean up
select * from finish();
rollback;
