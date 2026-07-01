-- ============================================================================
-- pgTAP tests: payroll_run_manual_days RLS + set_run_manual_days RPC
--
-- Covers:
--   1. RPC function existence
--   2. Cross-company SELECT isolation
--   3. Employee-role can SELECT but cannot INSERT (RLS write guard)
--   4. set_run_manual_days: UNAUTHORIZED for non-admin caller
--   5. set_run_manual_days: RUN_NOT_EDITABLE on a completed run
--   6. set_run_manual_days: succeeds on a draft run (upsert)
--   7. days_worked clamped to 31 when input exceeds limit
--   8. Cross-company RPC call is rejected (UNAUTHORIZED)
-- ============================================================================

begin;
select plan(12);

create extension if not exists pgtap;

-- ── Fixtures ──────────────────────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('a1000001-1111-1111-1111-111111111111', 'owner@company-a.local'),
  ('a1000002-1111-1111-1111-111111111111', 'employee@company-a.local'),
  ('b1000001-1111-1111-1111-111111111111', 'owner@company-b.local');

insert into public.companies (id, name, created_by) values
  ('aaaa0001-0000-0000-0000-000000000000', 'Company A', 'a1000001-1111-1111-1111-111111111111'),
  ('bbbb0001-0000-0000-0000-000000000000', 'Company B', 'b1000001-1111-1111-1111-111111111111');

insert into public.company_members (company_id, user_id, role) values
  ('aaaa0001-0000-0000-0000-000000000000', 'a1000001-1111-1111-1111-111111111111', 'owner'),
  ('aaaa0001-0000-0000-0000-000000000000', 'a1000002-1111-1111-1111-111111111111', 'employee'),
  ('bbbb0001-0000-0000-0000-000000000000', 'b1000001-1111-1111-1111-111111111111', 'owner');

insert into public.employees (id, company_id, full_name, status) values
  ('ea000001-0000-0000-0000-000000000001', 'aaaa0001-0000-0000-0000-000000000000', 'Emp A1', 'active'),
  ('eb000001-0000-0000-0000-000000000001', 'bbbb0001-0000-0000-0000-000000000000', 'Emp B1', 'active');

-- Two runs for Company A: one draft, one completed (different months to satisfy
-- the UNIQUE (company_id, period_year, period_month) constraint).
insert into public.payroll_runs (id, company_id, period_year, period_month, status) values
  ('aaaa1111-0000-0000-0000-000000000001', 'aaaa0001-0000-0000-0000-000000000000', 2026, 7, 'draft'),
  ('aaaa1111-0000-0000-0000-000000000002', 'aaaa0001-0000-0000-0000-000000000000', 2026, 6, 'completed'),
  ('bbbb1111-0000-0000-0000-000000000001', 'bbbb0001-0000-0000-0000-000000000000', 2026, 7, 'draft');

-- Pre-seed a manual-days row for Company A's draft run (postgres role, bypasses RLS).
insert into public.payroll_run_manual_days
  (company_id, payroll_run_id, employee_id, days_worked)
values
  ('aaaa0001-0000-0000-0000-000000000000', 'aaaa1111-0000-0000-0000-000000000001',
   'ea000001-0000-0000-0000-000000000001', 20);

-- Helper: switch to authenticated role impersonating a specific user.
create or replace function tests.authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- Helper: reset to postgres superuser.
create or replace function tests.reset_role() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;

-- ── 1. RPC function existence ─────────────────────────────────────────────────
select has_function(
  'public', 'set_run_manual_days', array['uuid', 'uuid', 'integer'],
  'set_run_manual_days(uuid, uuid, integer) exists'
);

-- ── 2. Company A owner can SELECT Company A manual days ──────────────────────
select tests.authenticate_as('a1000001-1111-1111-1111-111111111111');
select is(
  (select count(*)::int
   from public.payroll_run_manual_days
   where payroll_run_id = 'aaaa1111-0000-0000-0000-000000000001'),
  1,
  'Company A owner can SELECT Company A manual-days row'
);

-- ── 3. Cross-company isolation: Company B owner sees 0 rows from Company A ───
select tests.authenticate_as('b1000001-1111-1111-1111-111111111111');
select is(
  (select count(*)::int
   from public.payroll_run_manual_days
   where company_id = 'aaaa0001-0000-0000-0000-000000000000'),
  0,
  'Company B owner cannot SELECT Company A manual-days rows (RLS isolation)'
);

-- ── 4. Employee-role can SELECT (member read policy) ─────────────────────────
select tests.authenticate_as('a1000002-1111-1111-1111-111111111111');
select is(
  (select count(*)::int
   from public.payroll_run_manual_days
   where company_id = 'aaaa0001-0000-0000-0000-000000000000'),
  1,
  'Employee-role member can SELECT manual-days rows for their company'
);

-- ── 5. Employee-role cannot INSERT (admin write policy blocks it) ─────────────
-- The pre-seeded row uses key (aaaa1111…, ea000001…). We attempt the same key;
-- RLS WITH CHECK fires before the unique-constraint check.
select throws_ok(
  $$insert into public.payroll_run_manual_days
      (company_id, payroll_run_id, employee_id, days_worked)
    values
      ('aaaa0001-0000-0000-0000-000000000000',
       'aaaa1111-0000-0000-0000-000000000001',
       'ea000001-0000-0000-0000-000000000001',
       15)$$,
  'new row violates row-level security policy for table "payroll_run_manual_days"',
  'Employee-role cannot INSERT directly into payroll_run_manual_days'
);

-- ── 6. set_run_manual_days: UNAUTHORIZED for employee caller ─────────────────
select throws_ok(
  $$select public.set_run_manual_days(
      'aaaa1111-0000-0000-0000-000000000001',
      'ea000001-0000-0000-0000-000000000001',
      22)$$,
  'UNAUTHORIZED',
  'Employee cannot call set_run_manual_days (UNAUTHORIZED)'
);

-- ── 7. set_run_manual_days: RUN_NOT_EDITABLE on completed run ────────────────
select tests.authenticate_as('a1000001-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.set_run_manual_days(
      'aaaa1111-0000-0000-0000-000000000002',
      'ea000001-0000-0000-0000-000000000001',
      22)$$,
  'RUN_NOT_EDITABLE',
  'Admin cannot call set_run_manual_days on a completed run'
);

-- ── 8. set_run_manual_days: succeeds on draft run (upsert) ───────────────────
select lives_ok(
  $$select public.set_run_manual_days(
      'aaaa1111-0000-0000-0000-000000000001',
      'ea000001-0000-0000-0000-000000000001',
      18)$$,
  'Admin can call set_run_manual_days on a draft run'
);

select tests.reset_role();
select is(
  (select days_worked
   from public.payroll_run_manual_days
   where payroll_run_id = 'aaaa1111-0000-0000-0000-000000000001'
     and employee_id = 'ea000001-0000-0000-0000-000000000001'),
  18,
  'days_worked updated to 18 after upsert via set_run_manual_days'
);

-- ── 9. Clamp > 31 to 31 ──────────────────────────────────────────────────────
select tests.authenticate_as('a1000001-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.set_run_manual_days(
      'aaaa1111-0000-0000-0000-000000000001',
      'ea000001-0000-0000-0000-000000000001',
      99)$$,
  'set_run_manual_days accepts 99 (clamps without error)'
);

select tests.reset_role();
select is(
  (select days_worked
   from public.payroll_run_manual_days
   where payroll_run_id = 'aaaa1111-0000-0000-0000-000000000001'
     and employee_id = 'ea000001-0000-0000-0000-000000000001'),
  31,
  'days_worked clamped to 31 when input was 99'
);

-- ── 10. Cross-company RPC call blocked: Company B owner on Company A run ──────
select tests.authenticate_as('b1000001-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.set_run_manual_days(
      'aaaa1111-0000-0000-0000-000000000001',
      'ea000001-0000-0000-0000-000000000001',
      5)$$,
  'UNAUTHORIZED',
  'Company B owner cannot call set_run_manual_days on Company A run'
);

select * from finish();
rollback;
