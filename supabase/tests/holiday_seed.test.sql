begin;
select plan(9);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Impersonate helper
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- 1. Verify function exists
select has_function(
  'public',
  'seed_indonesian_holidays',
  array['integer'],
  'Function public.seed_indonesian_holidays(integer) exists'
);

-- 2. Verify security privileges: anon cannot execute, authenticated can
select is(
  has_function_privilege('anon', 'public.seed_indonesian_holidays(integer)', 'execute'),
  false,
  'Anonymous users do not have execute privilege on seed_indonesian_holidays'
);

select is(
  has_function_privilege('authenticated', 'public.seed_indonesian_holidays(integer)', 'execute'),
  true,
  'Authenticated users have execute privilege on seed_indonesian_holidays'
);

-- Authenticate as a test user
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');

-- 3. Verify seeding 2026
select lives_ok(
  $$select public.seed_indonesian_holidays(2026)$$,
  'Seeding 2026 national holidays succeeds'
);

-- 4. Verify count for 2026 is 17
select is(
  (select count(*)::int from public.holidays where date >= '2026-01-01' and date <= '2026-12-31'),
  17,
  '17 national holidays seeded for year 2026'
);

-- 5. Verify idempotency
select lives_ok(
  $$select public.seed_indonesian_holidays(2026)$$,
  'Seeding 2026 national holidays again succeeds (idempotent)'
);

select is(
  (select count(*)::int from public.holidays where date >= '2026-01-01' and date <= '2026-12-31'),
  17,
  'Still exactly 17 national holidays seeded for year 2026 after second run'
);

-- 6. Verify fallback for unsupported year 2028
select lives_ok(
  $$select public.seed_indonesian_holidays(2028)$$,
  'Seeding 2028 national holidays fallback succeeds'
);

select is(
  (select count(*)::int from public.holidays where date >= '2028-01-01' and date <= '2028-12-31'),
  5,
  '5 default national holidays seeded for fallback year 2028'
);

select * from finish();
rollback;
