-- ============================================================================
-- pgTAP tests for Overtime Approval Roles (allow managers, block self-approval)
-- ============================================================================

begin;
select plan(7);

-- Ensure pgTAP is available
create extension if not exists pgtap;

-- ── 1. Setup Fixtures ────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@company-a.local'),
  ('22222222-2222-2222-2222-222222222222', 'manager@company-a.local'),
  ('33333333-3333-3333-3333-333333333333', 'employee@company-a.local'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@other.local');

insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'employee');

-- Employees mapping
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Manager Emp'),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Employee Emp');

-- Insert unapproved overtime entries
insert into public.overtime_entries (company_id, employee_id, date, duration_minutes, multiplier, is_approved) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e2222222-2222-2222-2222-222222222222', '2026-06-01', 120, 1.0, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', '2026-06-01', 60, 1.0, false);

-- Helper: impersonate authenticated user
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 2. Run Tests ────────────────────────────────────────────────────────────

-- Test 1: Function existence
select has_function('public', 'user_is_company_manager_or_admin', array['uuid'], 'Helper user_is_company_manager_or_admin exists');

-- Test 2: Manager can select entries
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from public.overtime_entries),
  2,
  'Manager can select all overtime entries in company'
);

-- Test 3: Manager can approve regular employee entry
select lives_ok(
  $$ update public.overtime_entries set is_approved = true where employee_id = 'e2222222-2222-2222-2222-222222222222' and date = '2026-06-01' $$,
  'Manager can approve a regular employee overtime entry'
);

-- Test 4: Manager cannot approve their own entry
select throws_ok(
  $$ update public.overtime_entries set is_approved = true where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01' $$,
  '42501', -- RLS violation
  NULL,
  'Manager is blocked by RLS from approving their own overtime entry'
);

-- Test 5: Manager can edit duration on their own entry (as long as it is not approved)
select lives_ok(
  $$ update public.overtime_entries set duration_minutes = 90 where employee_id = 'e1111111-1111-1111-1111-111111111111' and date = '2026-06-01' $$,
  'Manager can edit duration of their own unapproved overtime entry'
);

-- Test 6: Regular employee cannot approve any entry (including their own)
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ update public.overtime_entries set is_approved = true where employee_id = 'e2222222-2222-2222-2222-222222222222' and date = '2026-06-01' $$,
  '42501', -- RLS violation
  NULL,
  'Regular employee cannot approve their own overtime entry'
);

-- Test 7: Outsider cannot write/read anything
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from public.overtime_entries),
  0,
  'Outsider cannot read Company A overtime entries'
);

-- Clean up
select * from finish();
rollback;
