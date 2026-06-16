begin;
select plan(4);

create extension if not exists pgtap;

-- Fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'user-c@test.local');

-- Update names to test profile retrieval
update public.profiles set full_name = 'User A' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'User B' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set full_name = 'User C' where id = '33333333-3333-3333-3333-333333333333';

-- One company.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships: User A and User B belong to Company A. User C does not.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee');

-- Helper to authenticate
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- 1. User A can see their own profile
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is(
  (select full_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'User A',
  'User A should see their own profile'
);

-- 2. User A can see User B's profile (they share Company A)
select is(
  (select full_name from profiles where id = '22222222-2222-2222-2222-222222222222'),
  'User B',
  'User A should see User B profile (shares company)'
);

-- 3. User A cannot see User C's profile (different company / no company)
select is(
  (select full_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
  null,
  'User A should NOT see User C profile (does not share company)'
);

-- 4. User B can see User A's profile
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(
  (select full_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'User A',
  'User B should see User A profile (shares company)'
);

select * from finish();
rollback;
