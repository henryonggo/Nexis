-- ============================================================================
-- pgTAP tests for Nexis Stage 6: Pre-Run Payroll Validation RPC (G7)
-- Verifies:
-- 1. Function existence and privileges.
-- 2. Access control (admins can select, regular employees/outsiders blocked).
-- 3. Correctness of readiness flags and issue classification.
-- ============================================================================

begin;
select plan(11);

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

-- Active employees (e.g. roster records)
insert into employees (id, company_id, user_id, full_name, status) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Test Employee 1', 'active'),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Test Employee 2', 'active');

-- Helper: impersonate authenticated user
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 2. Test Function Existence and Security ───────────────────────────────
select has_function('public', 'get_payroll_readiness', array['uuid'], 'Function get_payroll_readiness exists');

-- ── 3. Test Access Control ──────────────────────────────────────────────────
-- Outsider check (raises exception)
select tests_authenticate_as('44444444-4444-4444-4444-444444444444');
select throws_ok(
  $$ select * from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'Unauthorized to view payroll readiness for this company',
  'Outsider is blocked from executing get_payroll_readiness'
);

-- Regular employee check (raises exception)
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select * from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'Unauthorized to view payroll readiness for this company',
  'Plain employee is blocked from executing get_payroll_readiness'
);

-- Owner check (succeeds)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select * from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'Company owner can successfully query get_payroll_readiness'
);

-- ── 4. Test Correctness & Issues Accumulation ──────────────────────────────
-- Initially, employees have no comp, no tax, no bank account
select is(
  (select count(*)::int from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where is_ready = false),
  2,
  'All active employees start as not ready (is_ready = false)'
);

select results_eq(
  $$ select employee_id, has_compensation, has_tax_profile, has_bank_account, is_ready, issues from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where employee_id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ values ('e1111111-1111-1111-1111-111111111111'::uuid, false, false, false, false, array['missing_compensation', 'missing_tax_profile', 'missing_bank_account']) $$,
  'Renders all 3 missing fields and flags for new employee'
);

-- Bypassing RLS to setup details for Test Employee 1
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);

-- Step 4.1: Add compensation profile
insert into public.compensation (company_id, employee_id, base_salary)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 5000000);

select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$ select employee_id, has_compensation, has_tax_profile, has_bank_account, is_ready, issues from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where employee_id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ values ('e1111111-1111-1111-1111-111111111111'::uuid, true, false, false, false, array['missing_tax_profile', 'missing_bank_account']) $$,
  'Correctly clears missing_compensation check after compensation is added'
);

-- Step 4.2: Add tax profile
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
insert into public.tax_profile (company_id, employee_id, ptkp_status)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'TK/0');

select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$ select employee_id, has_compensation, has_tax_profile, has_bank_account, is_ready, issues from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where employee_id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ values ('e1111111-1111-1111-1111-111111111111'::uuid, true, true, false, false, array['missing_bank_account']) $$,
  'Correctly clears missing_tax_profile check after tax profile is added'
);

-- Step 4.3: Add bank account
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
insert into public.bank_accounts (company_id, employee_id, bank_name, account_no, account_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'BCA', '123456', 'Test Employee 1');

select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$ select employee_id, has_compensation, has_tax_profile, has_bank_account, is_ready, issues from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where employee_id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ values ('e1111111-1111-1111-1111-111111111111'::uuid, true, true, true, true, array[]::text[]) $$,
  'Correctly resolves all checks and is_ready = true when all three profiles exist'
);

select is(
  (select count(*)::int from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where is_ready = true),
  1,
  'Test Employee 1 is now listed as ready'
);

select is(
  (select count(*)::int from public.get_payroll_readiness('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where is_ready = false),
  1,
  'Test Employee 2 is still listed as not ready'
);

-- Clean up
select * from finish();
rollback;
