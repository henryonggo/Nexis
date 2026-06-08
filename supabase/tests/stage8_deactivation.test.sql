-- ============================================================================
-- pgTAP tests for Nexis account deactivation (reversible).
-- Proves:
-- 1. Normal active user has access.
-- 2. Running deactivate_current_user() sets deactivated_at and banned_until.
-- 3. Deactivated user's access to all RLS-protected tables (profiles, companies, employees) is blocked.
-- ============================================================================

begin;
select plan(8);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- ── Fixtures (created as privileged role; RLS bypass) ─────────────────────────
-- Two auth users.
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'user-active@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'user-to-deactivate@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Company C', '44444444-4444-4444-4444-444444444444');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'free', 5);

-- Memberships: user-to-deactivate owns C.
insert into company_members (company_id, user_id, role) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'owner');

-- Employees in C.
insert into employees (id, company_id, user_id, full_name) values
  ('e0000000-0000-0000-0000-0000000000c1', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '44444444-4444-4444-4444-444444444444', 'User to Deactivate');

-- ── Helper: impersonate authenticated user ─────────────────────────────────────
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ============================================================================
-- Step 1: Verify active user has access
-- ============================================================================
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');

-- 1. Can read their own profile row.
select is(
  (select count(*)::int from profiles where id = '44444444-4444-4444-4444-444444444444'),
  1,
  'Active user can read their own profile'
);

-- 2. Can read their company.
select is(
  (select count(*)::int from companies where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  'Active user can read Company C'
);

-- 3. Can read their employee record.
select is(
  (select count(*)::int from employees where company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  'Active user can read employee roster'
);

-- ============================================================================
-- Step 2: Run deactivate_current_user()
-- ============================================================================
select deactivate_current_user();

-- Reset to privileged user to inspect records directly (RLS bypass)
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- 4. Check deactivated_at is set.
select isnt(
  (select deactivated_at from profiles where id = '44444444-4444-4444-4444-444444444444'),
  null,
  'Profiles.deactivated_at is populated after deactivation'
);

-- 5. Check auth.users.banned_until is set to far-future.
select is(
  (select banned_until from auth.users where id = '44444444-4444-4444-4444-444444444444'),
  '3000-01-01 00:00:00+00'::timestamptz,
  'Auth.users.banned_until is set to a far-future date'
);

-- ============================================================================
-- Step 3: Verify access is blocked as deactivated user
-- ============================================================================
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');

-- 6. Cannot read their own profile row.
select is(
  (select count(*)::int from profiles where id = '44444444-4444-4444-4444-444444444444'),
  0,
  'Deactivated user cannot read their profile row'
);

-- 7. Cannot read their company.
select is(
  (select count(*)::int from companies where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  0,
  'Deactivated user cannot read Company C'
);

-- 8. Cannot read their employee record.
select is(
  (select count(*)::int from employees where company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  0,
  'Deactivated user cannot read employee roster'
);

select * from finish();
rollback;
