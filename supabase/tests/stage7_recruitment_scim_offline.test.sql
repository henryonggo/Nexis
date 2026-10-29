-- ============================================================================
-- pgTAP tests for Nexis Phase 5 Handoffs and Stage 7 Tracks
-- Verifies:
-- 1. Profiles whatsapp_opt_in column and RLS.
-- 2. Currencies & Exchange rates tables and RLS.
-- 3. Mobile offline attendance deduplication.
-- (Recruitment/ATS and SCIM coverage removed with the Nexis Lite schema cut.)
-- ============================================================================

begin;
select plan(5);

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
-- Test 2: Currencies and Exchange Rates select
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
-- Test 3: Mobile offline attendance deduplication
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
