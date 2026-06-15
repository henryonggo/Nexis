-- ============================================================================
-- pgTAP tests for Selfie Liveness and Government Filing Ledger RLS
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(11);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'admin@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'employee@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'employee');

-- Employees.
insert into employees (id, company_id, user_id, full_name, email, status) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Employee A', 'employee@test.local', 'active');

-- Shifts and work schedules.
insert into shifts (id, company_id, name, start_time, end_time) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Regular', '08:00', '17:00');

insert into work_schedules (employee_id, company_id, day_of_week, shift_id) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'c1111111-1111-1111-1111-111111111111');

-- Payroll run.
insert into payroll_runs (id, company_id, period_year, period_month, status) values
  ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 6, 'draft');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 1. Selfie Liveness Columns Verification ─────────────────────────────────

-- Insert record as service role (representing API/background service)
insert into attendance_records (
  company_id,
  employee_id,
  event_at,
  kind,
  latitude,
  longitude,
  liveness_passed,
  liveness_score,
  liveness_method
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'e1000000-0000-0000-0000-000000000001',
  '2026-06-15 08:00:00+00',
  'clock_in',
  -6.2000,
  106.8166,
  true,
  0.98,
  'face_api'
);

select results_eq(
  'select liveness_passed, liveness_score, liveness_method from attendance_records limit 1',
  $$values (true, 0.98::numeric, 'face_api')$$
);

-- ── 2. Government Filing Ledger RLS Tests ─────────────────────────────────

-- Insert dummy filing entries as service role
insert into filing_submissions (id, company_id, run_id, kind, status, external_ref) values
  ('f1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1111111-1111-1111-1111-111111111111', 'djp', 'submitted', 'ref_djp_123'),
  ('f1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1111111-1111-1111-1111-111111111111', 'sipp', 'queued', null);

-- 2a. Owner SELECT
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select results_eq(
  'select count(*)::integer from filing_submissions',
  'values (2)'
);

-- 2b. Admin SELECT
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select results_eq(
  'select count(*)::integer from filing_submissions',
  'values (2)'
);

-- 2c. Employee SELECT (should be blocked)
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select results_eq(
  'select count(*)::integer from filing_submissions',
  'values (0)'
);

-- 2d. Stranger SELECT (should be blocked)
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select results_eq(
  'select count(*)::integer from filing_submissions',
  'values (0)'
);

-- 2e. Owner INSERT (writes should be blocked for client-app level)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$insert into filing_submissions (company_id, run_id, kind, status) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1111111-1111-1111-1111-111111111111', 'djp', 'queued')$$,
  '42501',
  null,
  'Owner cannot insert filing_submissions'
);
-- Check that the insert did not happen (count remains 2)
select results_eq(
  'select count(*)::integer from filing_submissions',
  'values (2)'
);

-- 2f. Owner UPDATE (writes should be blocked)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$update filing_submissions set status = 'accepted' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'Owner attempting update does not fail but RLS filters it'
);
-- Check update did not modify status (remains submitted)
select results_eq(
  $$select status from filing_submissions where id = 'f1000000-0000-0000-0000-000000000001'$$,
  $$values ('submitted')$$
);

-- 2g. Owner DELETE (writes should be blocked)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$delete from filing_submissions where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'Owner attempting delete does not fail but RLS filters it'
);
-- Check that the delete did not happen (count remains 2)
select results_eq(
  'select count(*)::integer from filing_submissions',
  'values (2)'
);

select * from finish();
rollback;
