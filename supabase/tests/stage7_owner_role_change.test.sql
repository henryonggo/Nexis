-- ============================================================================
-- pgTAP tests for role self-change and demotion policies
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(5);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (id, company_id, user_id, role) values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- 1. Verify owner starts as admin/owner
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select role from company_members where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('owner'::company_role)$$
);

-- 2. Owner changes their own role to 'employee' (should succeed)
select lives_ok(
  $$update company_members set role = 'employee' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'Owner can successfully demote themselves to employee'
);

-- 3. Verify their role is indeed changed to 'employee'
select results_eq(
  $$select role from company_members where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('employee'::company_role)$$
);

-- 4. Former owner (now employee) tries to update another role (should fail silently under RLS)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
update company_members set role = 'admin' where user_id = '22222222-2222-2222-2222-222222222222';
select is(
  (select role::text from company_members where user_id = '22222222-2222-2222-2222-222222222222'),
  'employee',
  'Demoted owner (now employee) cannot edit other members (role remains employee)'
);

-- 5. Regular employee cannot update their own role (should fail silently under RLS)
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
update company_members set role = 'admin' where user_id = '22222222-2222-2222-2222-222222222222';
select is(
  (select role::text from company_members where user_id = '22222222-2222-2222-2222-222222222222'),
  'employee',
  'Regular employee cannot promote themselves to admin (role remains employee)'
);

select * from finish();
rollback;
