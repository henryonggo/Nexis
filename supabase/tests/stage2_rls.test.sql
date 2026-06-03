-- ============================================================================
-- pgTAP tests for Nexis multi-tenant RLS + free-seat trigger.
-- Run with:  supabase test db   (requires `supabase start`)
-- Proves the core security guarantee: a user who is owner of company A and an
-- employee of company B can fully read A, but only their OWN row in B, and can
-- never read a company they don't belong to.
-- ============================================================================

begin;
select plan(8);

-- Ensure pgTAP is available (Supabase provides it in the test runner).
create extension if not exists pgtap;

-- ── Fixtures (created as the privileged test role; RLS not enforced here) ─────
-- Two auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@test.local');

-- Two companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '22222222-2222-2222-2222-222222222222');

insert into company_billing (company_id, plan, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', 5),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'free', 5);

-- Memberships: user A owns A AND is an employee of B; user B owns B.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'employee');

-- Employees in B: one linked to user A (their own), one not.
insert into employees (id, company_id, user_id, full_name) values
  ('e0000000-0000-0000-0000-0000000000a1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'User A (in B)'),
  ('e0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'Someone Else (in B)');

-- ── Helper: impersonate an authenticated user via JWT claims ──────────────────
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ============================================================================
-- As USER A
-- ============================================================================
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- 1. Sees exactly the companies they belong to (A and B) — 2 rows.
select is(
  (select count(*)::int from companies),
  2,
  'User A sees the 2 companies they belong to'
);

-- 2. Can read Company A's row.
select is(
  (select count(*)::int from companies where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'User A can read Company A'
);

-- 3. In Company B (where A is only an employee), A reads ONLY their own employee row.
select is(
  (select count(*)::int from employees where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1,
  'Employee of B sees only their own employee record (not coworkers)'
);

-- 4. That one visible row is their own.
select is(
  (select full_name from employees where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'User A (in B)',
  'The single visible employee row in B is the user''s own'
);

-- ============================================================================
-- As USER B
-- ============================================================================
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

-- 5. User B cannot see Company A at all.
select is(
  (select count(*)::int from companies where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'User B cannot read Company A (no membership)'
);

-- 6. As owner of B, user B sees the full roster in B (2 employees).
select is(
  (select count(*)::int from employees where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  2,
  'Owner of B sees the full employee roster'
);

-- ============================================================================
-- Free-seat trigger (as USER A, owner of free company A)
-- ============================================================================
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Fill A up to the 5-seat free limit.
insert into employees (company_id, full_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A2'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A3'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A4'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A5');

-- 7. The 5 inserts succeeded (5 active employees in A).
select is(
  (select count(*)::int from employees where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  5,
  'Free plan allows exactly 5 employees'
);

-- 8. The 6th insert is rejected by the free-seat trigger.
select throws_ok(
  $$insert into employees (company_id, full_name)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A6 over limit')$$,
  'P0001',
  'FREE_SEAT_LIMIT_REACHED',
  'Free plan blocks the 6th employee'
);

select * from finish();
rollback;
