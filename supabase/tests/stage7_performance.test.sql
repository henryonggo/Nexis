-- ============================================================================
-- pgTAP tests for Nexis Stage 7: Performance & KPI RLS & RPCs
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(21);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Clean up any existing data in tables to ensure test isolation
truncate public.review_cycles cascade;

-- Fixtures: Auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'manager-a@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'employee-b@test.local'),
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

-- ── 1. Review Cycles RLS & Insert ───────────────────────────────────────────

-- Authenticate as owner-a
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Insert cycle as owner
insert into public.review_cycles (id, company_id, name, start_date, end_date, status) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026 H1', '2026-01-01', '2026-06-30', 'active');

select is(
  (select name from public.review_cycles where id = 'c1000000-0000-0000-0000-000000000001'),
  '2026 H1',
  'Owner-a can insert review cycles'
);

-- Authenticate as employee-a (regular employee)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee tries to insert cycle
select throws_ok(
  $$ insert into public.review_cycles (company_id, name, start_date, end_date) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fail Cycle', '2026-01-01', '2026-06-30') $$,
  '42501',
  null,
  'Regular employee cannot insert review cycles'
);

-- ── 2. Performance Goals RLS ────────────────────────────────────────────────

-- Authenticate as manager-a
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

-- Manager inserts goal for employee-a
insert into public.performance_goals (id, company_id, employee_id, cycle_id, title, weight) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Belajar Postgres', 50);

select is(
  (select title from public.performance_goals where id = '10000000-0000-0000-0000-000000000001'),
  'Belajar Postgres',
  'Manager can create performance goals'
);

-- Authenticate as employee-a
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee can select their own goal
select is(
  (select count(*)::int from public.performance_goals where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Employee can select their own goals'
);

-- Employee can update their own goal's progress
select lives_ok(
  $$ update public.performance_goals set progress = 75 where id = '10000000-0000-0000-0000-000000000001' $$,
  'Employee can update their own goal progress'
);

-- Authenticate as employee-b (stranger to Company A)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger cannot select Company A goals
select is(
  (select count(*)::int from public.performance_goals where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot select Company A goals'
);

-- Stranger tries to update Company A goals directly
update public.performance_goals set progress = 90 where id = '10000000-0000-0000-0000-000000000001';

-- Authenticate as owner-a to verify progress did not change (was blocked by RLS)
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select progress from public.performance_goals where id = '10000000-0000-0000-0000-000000000001'),
  75,
  'Stranger cannot update Company A goals'
);

-- ── 3. Performance Reviews RLS ──────────────────────────────────────────────

-- Authenticate as manager-a
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

-- Manager creates review draft (uses upsert-like query or direct insert)
insert into public.performance_reviews (id, company_id, employee_id, cycle_id, overall_rating, summary, status) values
  ('20000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 4.5, 'Kinerja sangat baik', 'draft');

select is(
  (select overall_rating from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001'),
  4.5,
  'Manager can create a draft performance review'
);

-- Authenticate as employee-a
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- Employee can select their own review
select is(
  (select count(*)::int from public.performance_reviews where employee_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'Employee can select their own reviews'
);

-- Employee tries to update review directly
update public.performance_reviews set overall_rating = 5.0 where id = '20000000-0000-0000-0000-000000000001';

-- Authenticate as manager-a to verify rating did not change (was blocked by RLS)
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
select is(
  (select overall_rating from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001'),
  4.5,
  'Employee cannot update reviews directly'
);

-- Authenticate as employee-b (stranger)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

-- Stranger cannot select Company A reviews
select is(
  (select count(*)::int from public.performance_reviews where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot select Company A reviews'
);

-- Stranger tries to edit Company A reviews
update public.performance_reviews set summary = 'Fail' where id = '20000000-0000-0000-0000-000000000001';

-- Authenticate as manager-a to verify summary did not change (was blocked by RLS)
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
select is(
  (select summary from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001'),
  'Kinerja sangat baik',
  'Stranger cannot update Company A reviews'
);

-- ── 4. RPC test: submit_review ──────────────────────────────────────────────

-- Authenticate as stranger
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_review('20000000-0000-0000-0000-000000000001') $$,
  'Unauthorized to submit reviews for this company',
  'Stranger cannot submit a review'
);

-- Authenticate as employee-a (reviewee)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.submit_review('20000000-0000-0000-0000-000000000001') $$,
  'Unauthorized to submit reviews for this company',
  'Employee cannot submit their own review'
);

-- Authenticate as manager-a
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.submit_review('20000000-0000-0000-0000-000000000001') $$,
  'Manager can submit a draft review'
);

select is(status, 'submitted', 'Review status is updated to submitted') from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001';
select is(reviewer_id, '33333333-3333-3333-3333-333333333333', 'Reviewer user ID is saved on submit') from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001';

-- ── 5. RPC test: acknowledge_review ─────────────────────────────────────────

-- Authenticate as manager-a (who is not the reviewee)
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.acknowledge_review('20000000-0000-0000-0000-000000000001') $$,
  'Only the reviewee can acknowledge this review',
  'Manager cannot acknowledge a review on behalf of the employee'
);

-- Authenticate as employee-a (the reviewee)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.acknowledge_review('20000000-0000-0000-0000-000000000001') $$,
  'Employee can acknowledge their own review'
);

select is(status, 'acknowledged', 'Review status transitions to acknowledged') from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001';
select is((select acknowledged_at from public.performance_reviews where id = '20000000-0000-0000-0000-000000000001') is not null, true, 'Acknowledged timestamp is set');

-- Clean up
select * from finish();
rollback;
