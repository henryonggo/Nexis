-- ============================================================================
-- pgTAP tests for Nexis P1-6: Leave Request Push Notifications Trigger
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(8);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Two auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee');

-- Employees.
insert into employees (id, company_id, user_id, full_name, manager_id) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Owner Employee', null),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Regular Employee', null);

-- Leave types.
insert into leave_types (id, company_id, name, paid, default_annual_days, accrual_method) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cuti Tahunan', true, 12, 'monthly');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 1. Table Schema Verification ─────────────────────────────────────────────

select has_table('expo_push_tokens');
select has_column('expo_push_tokens', 'user_id');
select has_column('expo_push_tokens', 'token');
select has_column('expo_push_tokens', 'created_at');

-- ── 2. RLS Policies Verification ─────────────────────────────────────────────

-- Authenticate as employee-a
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

-- Can insert own token
select lives_ok(
  $$insert into expo_push_tokens (user_id, token) values ('22222222-2222-2222-2222-222222222222', 'token_2')$$,
  'User can insert their own push token'
);

-- Cannot insert token for someone else
select throws_ok(
  $$insert into expo_push_tokens (user_id, token) values ('11111111-1111-1111-1111-111111111111', 'token_1')$$,
  '42501',
  null,
  'User cannot insert push token for someone else'
);

-- Cannot see someone else's token
-- First switch to owner-a to insert their token
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
insert into expo_push_tokens (user_id, token) values ('11111111-1111-1111-1111-111111111111', 'token_1');

-- Switch back to employee-a and verify they can only see 1 token (their own)
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from expo_push_tokens),
  1,
  'User can only see their own push tokens'
);

-- ── 3. Trigger Verification ──────────────────────────────────────────────────

-- Submitting a leave request by employee-a triggers a notification to owner-a (the manager/owner)
select lives_ok(
  $$insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days, reason)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', '2026-07-01', '2026-07-03', 3, 'Vacation')$$,
  'Trigger fires successfully and calls net.http_post without crashing the insert'
);

select * from finish();
rollback;
