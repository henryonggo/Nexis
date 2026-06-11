-- ============================================================================
-- pgTAP tests for Nexis Phase 5 Handoffs and Stage 7 Tracks
-- Verifies:
-- 1. Profiles whatsapp_opt_in column and RLS.
-- 2. Recruitment/ATS tables RLS and the hire_application RPC.
-- 3. Currencies & Exchange rates tables and RLS.
-- 4. SCIM SSO configurations, SCIM tokens, and SCIM bridge RPC helpers.
-- 5. Mobile offline attendance deduplication.
-- ============================================================================

begin;
select plan(18);

-- Ensure pgTAP is available
create extension if not exists pgtap;

-- ── Fixtures (privileged role; RLS bypass) ─────────────────────────
-- Users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@company-a.local'),
  ('22222222-2222-2222-2222-222222222222', 'manager@company-a.local'),
  ('33333333-3333-3333-3333-333333333333', 'employee@company-a.local'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@other.local');

-- Profiles are auto-created by trigger. Force set names/emails for simplicity.
update auth.users set email = 'owner@company-a.local' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Company Owner' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Company Manager' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set full_name = 'Test Employee' where id = '33333333-3333-3333-3333-333333333333';

-- Companies
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 5);

-- Company memberships
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'employee');

-- Employees
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'Test Employee');

-- ── Helper: impersonate authenticated user ─────────────────────────────────────
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ============================================================================
-- Test 1: Profiles whatsapp_opt_in column and RLS
-- ============================================================================
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

-- Can update self whatsapp_opt_in
update profiles set whatsapp_opt_in = true where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select whatsapp_opt_in from profiles where id = '33333333-3333-3333-3333-333333333333'),
  true,
  'User can update and read their own whatsapp_opt_in preference'
);

-- Reset back to false via postgres (bypass RLS)
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
update profiles set whatsapp_opt_in = false where id = '33333333-3333-3333-3333-333333333333';

-- Authenticate as outsider
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
update profiles set whatsapp_opt_in = true where id = '33333333-3333-3333-3333-333333333333';

-- Reset to postgres before checking
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

select is(
  (select whatsapp_opt_in from profiles where id = '33333333-3333-3333-3333-333333333333'),
  false,
  'Outsider cannot update other user profile whatsapp_opt_in'
);

-- ============================================================================
-- Test 2: Recruitment/ATS Schema and RLS
-- ============================================================================
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- Insert job opening as manager (via postgres bypass)
insert into job_openings (id, company_id, title, department, employment_type, status) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Software Engineer', 'Engineering', 'permanent', 'open');

insert into candidates (id, company_id, full_name, email, phone) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'John Doe', 'john.doe@test.local', '0812345678');

insert into applications (id, company_id, job_opening_id, candidate_id, stage) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'applied');

-- Check RLS: outsider cannot read job openings
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from job_openings),
  0,
  'Outsider cannot select job openings due to RLS'
);

-- Check RLS: employee can read job openings
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from job_openings),
  1,
  'Company member can select job openings'
);

-- Check RLS: employee cannot write/insert job openings
select throws_ok(
  $$ insert into job_openings (company_id, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Product Manager') $$,
  'new row violates row-level security policy for table "job_openings"',
  'Plain employee cannot insert a new job opening'
);

-- Check RLS: manager can insert job openings
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$ insert into job_openings (id, company_id, title) values ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Product Manager') $$,
  'Manager can insert job openings'
);

-- ============================================================================
-- Test 3: hire_application RPC function
-- ============================================================================
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from employees where status = 'probation'),
  0,
  'No probation employees initially'
);

select isnt(
  public.hire_application('a0000000-0000-0000-0000-000000000001'),
  null,
  'Hiring application returns a non-null employee ID'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

select is(
  (select count(*)::int from employees where status = 'probation'),
  1,
  'One probation employee exists after hire'
);

select is(
  (select stage from applications where id = 'a0000000-0000-0000-0000-000000000001'),
  'hired'::application_stage,
  'Application stage is updated to hired'
);

select is(
  (select status from job_openings where id = '10000000-0000-0000-0000-000000000001'),
  'filled'::job_opening_status,
  'Job opening status is updated to filled'
);

-- ============================================================================
-- Test 4: Currencies and Exchange Rates select
-- ============================================================================
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from currencies where code in ('IDR', 'USD')),
  2,
  'Seeded currencies IDR and USD exist and are readable'
);

select is(
  (select count(*)::int from exchange_rates where quote = 'USD' and base = 'IDR'),
  1,
  'USD to IDR exchange rate is readable'
);

-- ============================================================================
-- Test 5: SCIM Tokens and helper RPCs
-- ============================================================================
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Owner can generate SCIM token
select isnt(
  (select generate_scim_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  null,
  'Owner can generate SCIM token'
);

-- SCIM query helper returns user details
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

select is(
  (select count(*)::int from get_scim_users('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  3,
  'SCIM query helper returns all 3 members of company'
);

select is(
  (select full_name from get_scim_user_by_id('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333')),
  'Test Employee',
  'SCIM query user by ID returns correct name'
);

-- SCIM set active updates profile deactivated_at
select scim_set_user_active('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', false);
select isnt(
  (select deactivated_at from profiles where id = '33333333-3333-3333-3333-333333333333'),
  null,
  'SCIM set active = false populates deactivated_at'
);

-- ============================================================================
-- Test 6: Mobile offline attendance deduplication
-- ============================================================================
-- Insert an attendance log with client_uuid
insert into attendance_records (id, company_id, employee_id, kind, event_at, client_uuid) values
  ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', now(), 'c1234567-c123-c123-c123-c12345678901');

-- Inserting duplicate client_uuid for same company fails
select throws_ok(
  $$ insert into attendance_records (company_id, employee_id, kind, event_at, client_uuid) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', now(), 'c1234567-c123-c123-c123-c12345678901') $$,
  'duplicate key value violates unique constraint "attendance_records_client_uuid_key"',
  'Inserting duplicate client_uuid raises a unique violation error'
);

select * from finish();
rollback;
