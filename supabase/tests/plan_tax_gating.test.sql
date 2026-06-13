-- ============================================================================
-- pgTAP tests for Plan / NPWP Gating on Payroll Runs
-- ============================================================================

begin;
select plan(5);

-- Ensure pgTAP is available
create extension if not exists pgtap;

-- ── 1. Setup Fixtures ────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@company-a.local');

insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

-- Billing profile starts on free plan with NULL npwp
insert into company_billing (company_id, plan, npwp, free_seat_limit) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free', null, 5);

-- Create two runs in draft status
-- Monthly run
insert into public.payroll_runs (id, company_id, period_year, period_month, status, config_snapshot) values
  ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 6, 'draft', '{"runType": "monthly"}');

-- THR run
insert into public.payroll_runs (id, company_id, period_year, period_month, status, config_snapshot) values
  ('70000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 7, 'draft', '{"runType": "thr"}');

-- Helper: impersonate authenticated user
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 2. Run Tests ────────────────────────────────────────────────────────────

-- Authenticate as owner
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Test 1: Try to queue monthly run on free plan -> should fail with PLAN_GATE_FREE
select throws_ok(
  $$ update public.payroll_runs set status = 'queued' where id = '70000000-0000-0000-0000-000000000001' $$,
  'PLAN_GATE_FREE',
  'Monthly run on free plan is blocked from queuing with PLAN_GATE_FREE error'
);

-- Test 2: Try to queue THR run on free plan -> should succeed
select lives_ok(
  $$ update public.payroll_runs set status = 'queued' where id = '70000000-0000-0000-0000-000000000002' $$,
  'THR run is allowed to queue on free plan without restrictions'
);

-- Reset THR run back to draft for clean checks
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
update public.payroll_runs set status = 'draft' where id = '70000000-0000-0000-0000-000000000002';
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Test 3: Upgrade billing profile to paid plan (e.g. starter) but keep NPWP null
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
update public.company_billing set plan = 'starter' where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Try to queue monthly run -> should fail with NPWP_REQUIRED
select throws_ok(
  $$ update public.payroll_runs set status = 'queued' where id = '70000000-0000-0000-0000-000000000001' $$,
  'NPWP_REQUIRED',
  'Monthly run on paid plan but missing company NPWP is blocked with NPWP_REQUIRED error'
);

-- Test 4: Set valid NPWP on company billing
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', null, true);
update public.company_billing set npwp = '01.234.567.8-012.000' where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Try to queue monthly run -> should succeed
select lives_ok(
  $$ update public.payroll_runs set status = 'queued' where id = '70000000-0000-0000-0000-000000000001' $$,
  'Monthly run on paid plan with NPWP set is allowed to queue successfully'
);

-- Test 5: Verify that preview updates (inserting or updating as 'draft' or 'failed') is not gated
select lives_ok(
  $$ update public.payroll_runs set total_gross = 1000000 where id = '70000000-0000-0000-0000-000000000001' $$,
  'Editing other details on payroll runs remains unblocked'
);

-- Clean up
select * from finish();
rollback;
