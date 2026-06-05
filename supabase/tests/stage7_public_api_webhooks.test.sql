-- ============================================================================
-- pgTAP tests for Nexis Stage 7: Public API & Webhooks RLS, RPCs, & Triggers
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(10);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Clean up any existing data in tables to ensure test isolation
truncate public.company_api_keys, public.company_webhooks, public.webhook_queue cascade;

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

-- ── 1. RPC test: generate_api_key ───────────────────────────────────────────

-- Authenticate as owner-a
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Generate Key
select lives_ok(
  $$ select public.generate_api_key('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Prod Key', '{"employees:read", "attendance:write"}') $$,
  'Owner of Company A can generate API key'
);

-- Store key
select public.generate_api_key('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Prod Key 2', '{"employees:read", "attendance:write"}') as raw_key_fixture \gset

-- Verify Key prefix
select is(substring(:'raw_key_fixture', 1, 11), 'nexis_live_', 'API key starts with prefix nexis_live_');

-- Verify Hash stored in database
select is(
  encode(extensions.digest(:'raw_key_fixture', 'sha256'), 'hex'),
  (select key_hash from public.company_api_keys where name = 'Prod Key 2'),
  'SHA-256 hash of raw API key matches hash stored in database'
);

-- Authenticate as employee-b (stranger to Company A)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger tries to generate key
select throws_ok(
  $$ select public.generate_api_key('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fail Key', '{"employees:read"}') $$,
  'Unauthorized to generate API keys for this company',
  'Stranger cannot generate API key for another company'
);

-- ── 2. API Key RLS Select ───────────────────────────────────────────────────

-- Owner-a can select keys
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.company_api_keys where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  'Owner-a can select Company A API keys'
);

-- Stranger cannot select Company A keys
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.company_api_keys where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot select Company A API keys'
);

-- ── 3. Webhooks RLS ──────────────────────────────────────────────────────────

-- Authenticate as owner-a
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Insert Webhook Config
select lives_ok(
  $$ insert into public.company_webhooks (id, company_id, url, secret, events) values
     ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://requestb.in/1234', 'sec_123', '{"employee.created", "attendance.clock_in"}') $$,
  'Owner-a can create webhook configuration'
);

-- Authenticate as employee-b (stranger)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger cannot insert webhook configuration
select throws_ok(
  $$ insert into public.company_webhooks (company_id, url, secret, events) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://requestb.in/fail', 'sec_fail', '{"employee.created"}') $$,
  '42501',
  null,
  'Stranger cannot insert Company A webhook'
);

-- ── 4. Webhook Trigger Event Tests ───────────────────────────────────────────

-- Switch to postgres role to insert test entities directly
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- A. Insert Employee (should fire employee.created webhook trigger)
insert into public.employees (id, company_id, full_name, status) values
  ('e1000000-0000-0000-0000-000000000099', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Employee Hook Test', 'active');

-- Verify employee.created event is queued
select is(
  (select count(*)::int from public.webhook_queue where event_type = 'employee.created' and payload->>'full_name' = 'Employee Hook Test'),
  1,
  'Employee creation trigger correctly enqueues a webhook event'
);

-- B. Insert Attendance Record (should fire attendance.clock_in webhook trigger)
insert into public.attendance_records (company_id, employee_id, kind) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1000000-0000-0000-0000-000000000001', 'clock_in');

-- Verify attendance.clock_in event is queued
select is(
  (select count(*)::int from public.webhook_queue where event_type = 'attendance.clock_in' and payload->>'employee_id' = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Attendance clock-in trigger correctly enqueues a webhook event'
);

-- Clean up
select * from finish();
rollback;
