-- ============================================================================
-- pgTAP tests for Nexis Stage 6: Reporting, Exports & Subscription Billing RLS
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(9);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'manager-a@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'manager');

-- Billing: Starts on free, limit = 5
insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 5);

-- 5 active employees to hit the free seat limit
insert into employees (id, company_id, user_id, full_name, status) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Emp 1', 'active'),
  ('e1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Emp 2', 'active'),
  ('e1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Emp 3', 'active'),
  ('e1000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Emp 4', 'active'),
  ('e1000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Emp 5', 'active');

-- Subscriptions & Invoices (inserted privileged)
insert into subscriptions (id, company_id, status, plan_id, quantity) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', 'plan-gold', 5);

insert into invoices (id, company_id, subscription_id, amount, status) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '50000000-0000-0000-0000-000000000001', 500000, 'paid');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 1. Subscriptions RLS Tests ─────────────────────────────────────────────

-- Owner SELECT
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from subscriptions), 1, 'Owner can see subscriptions');

-- Employee SELECT (should see 0 rows)
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from subscriptions), 0, 'Regular employee cannot see subscriptions');

-- ── 2. Invoices RLS Tests ──────────────────────────────────────────────────

-- Owner SELECT
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from invoices), 1, 'Owner can see invoices');

-- Employee SELECT
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from invoices), 0, 'Regular employee cannot see invoices');

-- ── 3. Report Jobs RLS Tests ───────────────────────────────────────────────

-- Manager SELECT & INSERT
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
insert into report_jobs (id, company_id, report_type, status, created_by) values
  ('60000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'payroll_summary', 'pending', '33333333-3333-3333-3333-333333333333');
select is((select count(*)::int from report_jobs where id = '60000000-0000-0000-0000-000000000001'), 1, 'Manager can insert and select their own company report job');

-- Stranger SELECT & INSERT (should see 0, insert throws)
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select is((select count(*)::int from report_jobs where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'Stranger cannot see Company A report jobs');
select throws_ok(
  $$insert into report_jobs (company_id, report_type, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'payroll_summary', 'pending')$$,
  '42501',
  null,
  'Stranger cannot insert report jobs for Company A'
);

-- ── 4. Free Seat Limit Enforcement Tests ────────────────────────────────────

-- On free plan, inserting 6th employee should fail
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$insert into employees (company_id, full_name, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Emp 6 (Should Block)', 'active')$$,
  'P0001',
  'FREE_SEAT_LIMIT_REACHED',
  '6th active employee is blocked on free plan'
);

-- Flip company to paid plan
update company_billing set plan = 'starter' where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- On paid plan, inserting 6th employee should succeed
select lives_ok(
  $$insert into employees (company_id, full_name, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Emp 6 (Should Pass)', 'active')$$,
  '6th active employee is allowed on paid plan'
);

-- Clean up
select * from finish();
rollback;
