-- ============================================================================
-- pgTAP tests for Nexis: Self-service Contact & Bank RPC
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(8);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: Two auth users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'employee-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'stranger-b@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

-- Memberships.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'employee');

-- Employees.
-- employee-a has an employee record
insert into employees (id, company_id, user_id, full_name) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Employee A');

-- Helper impersonation.
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── 1. RPC Existence check ──────────────────────────────────────────────────

select has_function('public', 'update_own_contact', ARRAY['text', 'text', 'text', 'text']);

-- ── 2. Execution & Persistency tests ─────────────────────────────────────────

-- Authenticate as employee-a
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- Call RPC to update own contact & bank info (which should insert a bank account since none exists)
select lives_ok(
  $$select public.update_own_contact('+62812345678', 'BCA', '1234567890', 'Employee A')$$,
  'Employee can call update_own_contact to update phone and set bank info'
);

-- Check employee phone updated
select is(
  (select phone from employees where id = 'e1111111-1111-1111-1111-111111111111'),
  '+62812345678',
  'Employee phone number was successfully updated'
);

-- Check bank account created as primary
select is(
  (select count(*)::int from bank_accounts where employee_id = 'e1111111-1111-1111-1111-111111111111' and is_primary = true),
  1,
  'A primary bank account was successfully created'
);

select is(
  (select bank_name from bank_accounts where employee_id = 'e1111111-1111-1111-1111-111111111111' and is_primary = true),
  'BCA',
  'Bank name is BCA'
);

-- Call RPC again to update contact & bank info (should update the existing primary bank account)
select lives_ok(
  $$select public.update_own_contact('+62899999999', 'Mandiri', '0987654321', 'Employee A New')$$,
  'Employee can update their existing contact and bank info'
);

-- Verify updates
select is(
  (select bank_name from bank_accounts where employee_id = 'e1111111-1111-1111-1111-111111111111' and is_primary = true),
  'Mandiri',
  'Bank name successfully updated to Mandiri'
);

-- ── 3. Exception handling tests ──────────────────────────────────────────────

-- Authenticate as stranger-b (has no employee record)
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$select public.update_own_contact('+628123', 'BCA', '123', 'Name')$$,
  'NO_EMPLOYEE_RECORD',
  'Calling update_own_contact fails if user has no employee record'
);

select * from finish();
rollback;
