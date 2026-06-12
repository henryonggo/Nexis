begin;
select plan(14);

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

-- User accounts first (for foreign keys)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'sari@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'already@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'mismatch@test.local');

-- Companies
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '22222222-2222-2222-2222-222222222222');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 5),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'free', 5);

insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- Employees
-- Employee Sari in Company A (unclaimed)
insert into employees (id, company_id, full_name, email) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sari A', 'sari@test.local');

-- Employee Sari in Company B (unclaimed)
insert into employees (id, company_id, full_name, email) values
  ('e2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sari B', 'sari@test.local');

-- Employee Already Linked in Company A
insert into employees (id, company_id, full_name, email, user_id) values
  ('e3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Already Linked A', 'already@test.local', '44444444-4444-4444-4444-444444444444');

-- Invitations
insert into invitations (id, company_id, email, role, token, status, invited_by) values
  ('91111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sari@test.local', 'employee', 'token-sari-a', 'pending', '11111111-1111-1111-1111-111111111111'),
  ('92222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'already@test.local', 'employee', 'token-already-a', 'pending', '11111111-1111-1111-1111-111111111111'),
  ('93333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sari@test.local', 'employee', 'token-sari-b', 'pending', '22222222-2222-2222-2222-222222222222');

-- Test cases

-- Test 1: Email mismatch raises error and links nothing
select tests_authenticate_as('55555555-5555-5555-5555-555555555555'); -- mismatch@test.local
select throws_ok(
  $$select public.accept_invitation('token-sari-a')$$,
  'P0001',
  'INVITE_EMAIL_MISMATCH',
  'Email-mismatch invite raises INVITE_EMAIL_MISMATCH'
);

-- Test 2: Accept invite links employees.user_id and company_members.employee_id in Company A
select tests_authenticate_as('33333333-3333-3333-3333-333333333333'); -- sari@test.local
select results_eq(
  $$select public.accept_invitation('token-sari-a')$$,
  $$values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)$$,
  'Sari accepts invite to Company A'
);

select is(
  (select user_id from employees where id = 'e1111111-1111-1111-1111-111111111111'),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'Sari''s employee row in Company A is linked to her user account'
);

select is(
  (select employee_id from company_members where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and user_id = '33333333-3333-3333-3333-333333333333'),
  'e1111111-1111-1111-1111-111111111111'::uuid,
  'Sari''s membership in Company A is linked to her employee row'
);

-- Test 3: Cross-company: same email in Company B is NOT linked when accepting Company A's invite
select is(
  (select user_id from employees where id = 'e2222222-2222-2222-2222-222222222222'),
  null::uuid,
  'Sari''s employee row in Company B is NOT linked when accepting Company A''s invite'
);

-- Test 4: Already-linked employee row is not overwritten by another accept
select tests_authenticate_as('44444444-4444-4444-4444-444444444444'); -- already@test.local
select results_eq(
  $$select public.accept_invitation('token-already-a')$$,
  $$values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)$$,
  'Already linked user accepts another invite'
);
select is(
  (select user_id from employees where id = 'e3333333-3333-3333-3333-333333333333'),
  '44444444-4444-4444-4444-444444444444'::uuid,
  'Already linked employee user_id remains unchanged'
);

-- Test 5: Manual relink RPC works and is restricted to admin
select tests_authenticate_as('33333333-3333-3333-3333-333333333333'); -- Sari (regular employee)
select throws_ok(
  $$select public.link_employee_account('e2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'Regular employee cannot manually link accounts'
);

select tests_authenticate_as('22222222-2222-2222-2222-222222222222'); -- Owner of Company B
select lives_ok(
  $$select public.link_employee_account('e2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')$$,
  'Owner can manually link accounts'
);

select is(
  (select user_id from employees where id = 'e2222222-2222-2222-2222-222222222222'),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'Manual link updates employees.user_id'
);

select is(
  (select employee_id from company_members where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and user_id = '33333333-3333-3333-3333-333333333333'),
  'e2222222-2222-2222-2222-222222222222'::uuid,
  'Manual link updates company_members.employee_id'
);

-- Test 6: RLS checks: linked employee sees only their own employee row and can insert/select own attendance records
select tests_authenticate_as('33333333-3333-3333-3333-333333333333'); -- Sari (linked to e1111111 in A and e2222222 in B)

select is(
  (select count(*)::int from employees where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Sari sees exactly 1 employee in Company A (herself)'
);

select is(
  (select count(*)::int from employees where id = 'e3333333-3333-3333-3333-333333333333'),
  0,
  'Sari cannot see another employee row in Company A'
);

-- Test insertion of own attendance record
select lives_ok(
  $$insert into attendance_records (company_id, employee_id, kind, event_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', now())$$,
  'Sari can record clock_in for herself'
);

select * from finish();
rollback;
