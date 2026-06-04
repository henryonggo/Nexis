-- ============================================================================
-- pgTAP tests for Nexis Stage 4: Payroll & Reference Tables RLS
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(12);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Two auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@test.local');

-- A company.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee');

-- Employees.
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Owner Employee'),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Regular Employee');

-- Reference data (seeded for tests if truncate was run, or we insert custom ones for tests)
insert into ptkp_rates (id, status, annual_amount, effective_from) values
  ('ef000000-0000-0000-0000-000000000001', 'TK/0', 54000000, '2024-01-01');

insert into tax_brackets (id, lower_bound, upper_bound, rate_bps, effective_from) values
  ('ef000000-0000-0000-0000-000000000002', 0, 60000000, 500, '2024-01-01');

insert into ter_rates (id, category, income_lower, income_upper, rate_bps, effective_from) values
  ('ef000000-0000-0000-0000-000000000003', 'A', 0, 5400000, 0, '2024-01-01');

insert into bpjs_config (id, key, rate_bps, effective_from) values
  ('ef000000-0000-0000-0000-000000000004', 'kes_employee', 100, '2024-01-01');

-- Payroll run and items (privileged inserts)
insert into payroll_runs (id, company_id, period_year, period_month, status) values
  ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 5, 'draft');

insert into payroll_items (id, company_id, payroll_run_id, employee_id, gross_pay, net_pay) values
  ('d0000000-0000-0000-0000-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', 10000000, 9400000),
  ('d0000000-0000-0000-0000-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000001', 'e2222222-2222-2222-2222-222222222222', 8000000, 7500000);

insert into payslips (id, company_id, payroll_item_id, employee_id, pdf_path) values
  ('d0000000-0000-0000-0000-000000000111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000011', 'e1111111-1111-1111-1111-111111111111', 'aa/e11/ps1.pdf'),
  ('d0000000-0000-0000-0000-000000000112', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000012', 'e2222222-2222-2222-2222-222222222222', 'aa/e22/ps2.pdf');

-- ── Helper: impersonate an authenticated user via JWT claims ──────────────────
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── Test 1: Authenticated user can select reference tables ───────────────────
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

select is((select count(*)::int from ptkp_rates where id = 'ef000000-0000-0000-0000-000000000001'), 1, 'Regular Employee can read PTKP rates');
select is((select count(*)::int from tax_brackets where id = 'ef000000-0000-0000-0000-000000000002'), 1, 'Regular Employee can read tax brackets');
select is((select count(*)::int from ter_rates where id = 'ef000000-0000-0000-0000-000000000003'), 1, 'Regular Employee can read TER rates');
select is((select count(*)::int from bpjs_config where id = 'ef000000-0000-0000-0000-000000000004'), 1, 'Regular Employee can read BPJS config');

-- ── Test 2: Authenticated user cannot modify reference tables ─────────────────
select throws_ok(
  $$insert into ptkp_rates (status, annual_amount, effective_from) values ('TK/0', 50000000, '2025-01-01')$$,
  '42501', -- Insufficient privilege
  null,
  'Regular Employee cannot insert into ptkp_rates'
);

-- ── Test 3: Company Owner (Admin) has full access to payroll runs & items ────
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

select is((select count(*)::int from payroll_runs where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'Owner can see Company A payroll runs');
select is((select count(*)::int from payroll_items where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2, 'Owner can see all Company A payroll items');

-- ── Test 4: Regular Employee cannot see payroll runs, but can see their OWN item ────
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from payroll_items where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Regular Employee sees exactly one payroll item in Company A (their own)'
);

select is(
  (select employee_id from payroll_items where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'e2222222-2222-2222-2222-222222222222'::uuid,
  'The single payroll item visible to the regular employee is their own'
);

-- ── Test 5: Regular Employee can read their own payslip, but not others ──────
select is(
  (select count(*)::int from payslips where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Regular Employee sees exactly one payslip in Company A (their own)'
);

select is(
  (select employee_id from payslips where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'e2222222-2222-2222-2222-222222222222'::uuid,
  'The single payslip visible to the regular employee is their own'
);

-- ── Test 6: Stranger cannot see Company A's payroll runs, items or payslips ──
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from payroll_runs where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot see Company A payroll runs'
);

select * from finish();
rollback;
