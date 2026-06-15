-- ============================================================================
-- pgTAP tests for two-way company join requests
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(25);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'admin@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'manager@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'employee@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'requester1@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'requester2@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (id, company_id, user_id, role) values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'manager'),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'employee');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- Helper to reset auth back to superuser
create or replace function tests_deauthenticate() returns void
language plpgsql as $$
begin
  execute 'RESET ROLE';
  perform set_config('request.jwt.claims', null, true);
end; $$;

-- 1. Verify join code is generated on insert and is 8 chars.
select matches(
  (select join_code from companies where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$',
  'Join code matches alphabet and length'
);

-- 2. Owner can rotate join code.
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.rotate_company_join_code('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'Owner can rotate company join code'
);

-- Store the new rotated join code in a GUC variable while authenticated as owner
select set_config('test.join_code', (select join_code from companies where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);

-- 3. Admin can rotate join code.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$select public.rotate_company_join_code('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'Admin can rotate company join code'
);

-- Store the rotated join code in GUC variable again
select set_config('test.join_code', (select join_code from companies where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);

-- 4. Manager cannot rotate join code.
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.rotate_company_join_code('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'INSUFFICIENT_ROLE',
  'Manager cannot rotate company join code'
);

-- 5. Employee cannot rotate join code.
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select throws_ok(
  $$select public.rotate_company_join_code('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'INSUFFICIENT_ROLE',
  'Employee cannot rotate company join code'
);

-- 6. Request join with invalid code fails.
select tests_authenticate_as('55555555-5555-5555-5555-555555555555');
select throws_ok(
  $$select public.request_company_join('INVALID')$$,
  'INVALID_CODE',
  'Requesting join with invalid code throws INVALID_CODE'
);

-- 7. Request join with valid code succeeds.
select lives_ok(
  $$select public.request_company_join(current_setting('test.join_code'))$$,
  'Requesting join with valid code succeeds'
);

-- 8. Request join when already pending fails.
select throws_ok(
  $$select public.request_company_join(current_setting('test.join_code'))$$,
  'ALREADY_PENDING',
  'Requesting join when already pending throws ALREADY_PENDING'
);

-- 9. Request join when already member fails.
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select throws_ok(
  $$select public.request_company_join(current_setting('test.join_code'))$$,
  'ALREADY_MEMBER',
  'Requesting join when already member throws ALREADY_MEMBER'
);

-- 10. RLS on company_join_requests (select)
-- New user 5 can read their own request
select tests_authenticate_as('55555555-5555-5555-5555-555555555555');
select results_eq(
  $$select count(*)::integer from company_join_requests$$,
  $$values (1)$$,
  'User can read their own join request'
);

-- Outsider new user 6 cannot read user 5's request
select tests_authenticate_as('66666666-6666-6666-6666-666666666666');
select results_eq(
  $$select count(*)::integer from company_join_requests$$,
  $$values (0)$$,
  'Outsider cannot read others join request'
);

-- Owner can read company join requests
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select count(*)::integer from company_join_requests$$,
  $$values (1)$$,
  'Owner can read company join requests'
);

-- 11. Owner approves request as admin -> succeeds
select tests_authenticate_as('66666666-6666-6666-6666-666666666666');
select public.request_company_join(current_setting('test.join_code'));

select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.approve_join_request((select id from company_join_requests where user_id = '66666666-6666-6666-6666-666666666666' and status = 'pending'), 'admin'::company_role)$$,
  'Owner can approve request as admin'
);

select results_eq(
  $$select role from company_members where user_id = '66666666-6666-6666-6666-666666666666'$$,
  $$values ('admin'::company_role)$$,
  'Role is correctly set to admin'
);

-- 12. Admin approves request as admin -> fails
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.approve_join_request((select id from company_join_requests where user_id = '55555555-5555-5555-5555-555555555555' and status = 'pending'), 'admin'::company_role)$$,
  'INSUFFICIENT_ROLE',
  'Admin cannot approve request as admin'
);

-- 13. Admin approves request as owner -> fails
select throws_ok(
  $$select public.approve_join_request((select id from company_join_requests where user_id = '55555555-5555-5555-5555-555555555555' and status = 'pending'), 'owner'::company_role)$$,
  'INSUFFICIENT_ROLE',
  'Admin cannot approve request as owner'
);

-- 14. Admin approves request as manager -> succeeds
select lives_ok(
  $$select public.approve_join_request((select id from company_join_requests where user_id = '55555555-5555-5555-5555-555555555555' and status = 'pending'), 'manager'::company_role)$$,
  'Admin can approve request as manager'
);

select results_eq(
  $$select role from company_members where user_id = '55555555-5555-5555-5555-555555555555'$$,
  $$values ('manager'::company_role)$$,
  'Role is correctly set to manager'
);

-- 15. Manager/Employee cannot approve requests
select tests_deauthenticate();
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 'requester3@test.local');
select tests_authenticate_as('77777777-7777-7777-7777-777777777777');
select set_config('test.request_id', public.request_company_join(current_setting('test.join_code'))::text, true);

select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.approve_join_request(current_setting('test.request_id')::uuid, 'employee'::company_role)$$,
  'INSUFFICIENT_ROLE',
  'Manager cannot approve requests'
);

-- 16. Reject request works
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.reject_join_request(current_setting('test.request_id')::uuid, 'Rejected by owner')$$,
  'Owner can reject join request'
);

select results_eq(
  $$select status from company_join_requests where user_id = '77777777-7777-7777-7777-777777777777'$$,
  $$values ('rejected')$$,
  'Request status is rejected'
);

-- 17. Trying to approve decided request fails
select throws_ok(
  $$select public.approve_join_request(current_setting('test.request_id')::uuid, 'employee'::company_role)$$,
  'REQUEST_ALREADY_DECIDED',
  'Cannot approve already decided request'
);

-- 18. Unclaimed employee linking works
select tests_deauthenticate();
insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'employee8@test.local');
insert into employees (id, company_id, full_name, email, user_id) values ('e8888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Employee 8', 'employee8@test.local', null);

select tests_authenticate_as('88888888-8888-8888-8888-888888888888');
select public.request_company_join(current_setting('test.join_code'));

select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select public.approve_join_request((select id from company_join_requests where user_id = '88888888-8888-8888-8888-888888888888' and status = 'pending'), 'employee'::company_role);

select results_eq(
  $$select employee_id from company_members where user_id = '88888888-8888-8888-8888-888888888888'$$,
  $$values ('e8888888-8888-8888-8888-888888888888'::uuid)$$,
  'Company member links matching employee id'
);

select results_eq(
  $$select user_id from employees where id = 'e8888888-8888-8888-8888-888888888888'$$,
  $$values ('88888888-8888-8888-8888-888888888888'::uuid)$$,
  'Employee record is linked to user id'
);

-- 19. Consume matching pending invitation works
select tests_deauthenticate();
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'invited9@test.local');
insert into invitations (company_id, email, role, status, invited_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'invited9@test.local', 'employee'::company_role, 'pending'::invite_status, '11111111-1111-1111-1111-111111111111');

select tests_authenticate_as('99999999-9999-9999-9999-999999999999');
select public.request_company_join(current_setting('test.join_code'));

select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select public.approve_join_request((select id from company_join_requests where user_id = '99999999-9999-9999-9999-999999999999' and status = 'pending'), 'employee'::company_role);

select results_eq(
  $$select status::text from invitations where email = 'invited9@test.local'$$,
  $$values ('accepted')$$,
  'Invitation status is consumed and accepted'
);

select * from finish();
rollback;
