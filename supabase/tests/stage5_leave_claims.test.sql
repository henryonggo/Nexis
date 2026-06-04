-- ============================================================================
-- pgTAP tests for Nexis Stage 5: Leave & Reimbursement Claims RLS + RPC
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(20);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Two auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'employee-b@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '44444444-4444-4444-4444-444444444444');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'manager'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'owner');

-- Employees.
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Owner Employee'),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Regular Employee'),
  ('e3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Manager Employee'),
  ('e4444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'Stranger Employee');

-- Leave and claim types.
insert into leave_types (id, company_id, name, paid, default_annual_days, accrual_method) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cuti Tahunan', true, 12, 'monthly'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cuti B', true, 12, 'monthly');

insert into claim_types (id, company_id, name, taxable) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Medical', false),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Transport B', false);

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── RLS Tests ───────────────────────────────────────────────────────────────

-- Test 1: Employee can see own leave types, but not other company's
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from leave_types), 1, 'Employee can only read leave types from their own company');

-- Test 2: Employee can see own claim types, but not other company's
select is((select count(*)::int from claim_types), 1, 'Employee can only read claim types from their own company');

-- Test 3: Employee cannot insert leave types
select throws_ok(
  $$insert into leave_types (company_id, name, paid, default_annual_days, accrual_method) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Illegal Leave', true, 10, 'monthly')$$,
  '42501',
  null,
  'Employee cannot insert leave types'
);

-- Test 4: Employee cannot write directly to leave_balances
select throws_ok(
  $$insert into leave_balances (company_id, employee_id, leave_type_id, year, opening_balance) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 2026, 12)$$,
  '42501',
  null,
  'Employee cannot insert directly into leave_balances'
);

-- Test 5: Employee can insert their own leave requests
insert into leave_requests (id, company_id, employee_id, leave_type_id, start_date, end_date, days, reason) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', '2026-06-03', 3, 'Vacation');
select is((select count(*)::int from leave_requests where id = '50000000-0000-0000-0000-000000000001'), 1, 'Employee can insert and select their own leave request');

-- Test 6: Employee cannot insert leave request for another employee
select throws_ok(
  $$insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', '2026-06-03', 3)$$,
  '42501',
  null,
  'Employee cannot insert leave requests for someone else'
);

-- Test 7: Employee can cancel their own pending leave request (by updating to cancelled)
update leave_requests set status = 'cancelled' where id = '50000000-0000-0000-0000-000000000001';
select is((select status from leave_requests where id = '50000000-0000-0000-0000-000000000001'), 'cancelled'::leave_status, 'Employee can cancel their own pending leave request');

-- Test 8: Stranger cannot see Company A leave requests
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select is((select count(*)::int from leave_requests where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'Stranger cannot see Company A leave requests');

-- Test 9: Employee can insert their own reimbursement claim
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
insert into reimbursement_claims (id, company_id, employee_id, claim_type_id, amount, description) values
  ('60000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 150000, 'Doctor visit');
select is((select count(*)::int from reimbursement_claims where id = '60000000-0000-0000-0000-000000000001'), 1, 'Employee can insert and select their own claims');

-- Test 10: Employee cannot insert claim for another employee
select throws_ok(
  $$insert into reimbursement_claims (company_id, employee_id, claim_type_id, amount) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 100000)$$,
  '42501',
  null,
  'Employee cannot insert reimbursement claims for someone else'
);

-- Test 11: Employee cannot approve their own claim
select throws_ok(
  $$update reimbursement_claims set status = 'approved' where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Employee cannot directly approve their own claim'
);


-- ── RPC Tests ──────────────────────────────────────────────────────────────

-- Let's recreate a pending leave request for the RPC tests
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
insert into leave_requests (id, company_id, employee_id, leave_type_id, start_date, end_date, days, reason) values
  ('50000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', '2026-07-01', '2026-07-02', 2, 'Sick leave');

-- Test 12: Employee (non-manager) cannot execute approve_leave
select throws_ok(
  $$select public.approve_leave('50000000-0000-0000-0000-000000000002')$$,
  'P0001',
  'Unauthorized to approve leave requests for this company',
  'Regular employee cannot execute approve_leave'
);

-- Test 13: Manager can execute approve_leave
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$select public.approve_leave('50000000-0000-0000-0000-000000000002')$$,
  'Manager can execute approve_leave'
);

-- Test 14: Verify leave status is updated to 'approved' and decided_by is set
select is((select status from leave_requests where id = '50000000-0000-0000-0000-000000000002'), 'approved'::leave_status, 'Leave request status is now approved');
select is((select decided_by from leave_requests where id = '50000000-0000-0000-0000-000000000002'), 'e3333333-3333-3333-3333-333333333333'::uuid, 'decided_by is set to the manager employee ID');

-- Test 15: Verify leave_balances.used is incremented by 2 days
select is((select used from leave_balances where employee_id = 'e2222222-2222-2222-2222-222222222222' and leave_type_id = 'a1111111-1111-1111-1111-111111111111' and year = 2026), 2.0, 'Leave balance used is incremented correctly');

-- Test 16: Verify audit_logs contains an entry for the leave approval (switching to owner who can read audit_logs)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.audit_logs where action = 'approve_leave' and entity_id = '50000000-0000-0000-0000-000000000002'),
  1,
  'Audit log contains entry for the leave approval'
);

-- Test 17: Manager can execute approve_claim
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$select public.approve_claim('60000000-0000-0000-0000-000000000001')$$,
  'Manager can execute approve_claim'
);

-- Test 18: Verify claim status is updated to 'approved'
select is((select status from reimbursement_claims where id = '60000000-0000-0000-0000-000000000001'), 'approved'::claim_status, 'Claim status is now approved');

-- Test 19: Verify audit_logs contains an entry for the claim approval (switching to owner who can read audit_logs)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.audit_logs where action = 'approve_claim' and entity_id = '60000000-0000-0000-0000-000000000001'),
  1,
  'Audit log contains entry for the claim approval'
);

select * from finish();
rollback;
