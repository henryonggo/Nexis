begin;
select plan(7);

create extension if not exists pgtap;

-- Fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@test.local');

insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee');

-- Helper to authenticate
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- 1. Owner can insert config (verifying new column defaults)
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into company_employee_access (company_id, attendance, leave, claims, salary)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, true, false, false) $$,
  'Owner can insert company employee access'
);

-- 2. Verify new columns default correctly
select is(
  (select json_build_object(
     'dash_pay', dash_pay,
     'dash_leave', dash_leave,
     'dash_attendance', dash_attendance,
     'nav_style', nav_style
   )::text from company_employee_access where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  json_build_object(
     'dash_pay', true,
     'dash_leave', true,
     'dash_attendance', true,
     'nav_style', 'flat'
  )::text,
  'New columns default correctly'
);

-- 3. Owner can update config (including new columns)
select lives_ok(
  $$ update company_employee_access set salary = true, dash_pay = false, nav_style = 'pillars' where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'Owner can update company employee access'
);

-- 4. Verify invalid nav_style throws check constraint error
select throws_ok(
  $$ update company_employee_access set nav_style = 'invalid' where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514',
  null,
  'Invalid nav_style violates check constraint'
);

-- 5. Employee can read config
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(
  (select salary from company_employee_access where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'Employee can read company employee access'
);

-- 6. Employee cannot write config
update company_employee_access set salary = false where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select salary from company_employee_access where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'Employee cannot write company employee access (remains true)'
);

-- 7. Stranger cannot read config
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from company_employee_access where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Stranger cannot read company employee access'
);

select * from finish();
rollback;
