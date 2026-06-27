-- ============================================================================
-- pgTAP tests for portal_company_summaries() — cross-company portal RPC (P2-8).
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(6);

create extension if not exists pgtap;

-- Fixtures: two unrelated companies, each with its own owner. owner-a is a member
-- of A only — the function must never leak B to them (SECURITY INVOKER + RLS).
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'owner-a@portal.test'),
  ('b5555555-5555-5555-5555-555555555555', 'owner-b@portal.test');

insert into companies (id, name, created_by) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'Portal Co A', 'a1111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-5555-5555-5555-555555555555', 'Portal Co B', 'b5555555-5555-5555-5555-555555555555');

insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555', 'owner');

-- Company A: 2 active + 1 inactive employee → headcount must count only active.
insert into employees (company_id, full_name, status) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'A Active 1', 'active'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'A Active 2', 'active'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'A Gone',     'inactive');

-- ── Structural ────────────────────────────────────────────────────────────
select has_function('public', 'portal_company_summaries', 'function should exist');

select is(
  (select prosecdef from pg_proc where proname = 'portal_company_summaries'),
  false,
  'must be SECURITY INVOKER (RLS scopes the caller), not SECURITY DEFINER'
);

-- ── Behavioural under RLS: act as owner-a ────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*)::int from public.portal_company_summaries()),
  1,
  'owner-a sees exactly their one company (B is not leaked)'
);

select is(
  (select company_id from public.portal_company_summaries()),
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  'the single row is Company A'
);

select is(
  (select role from public.portal_company_summaries()),
  'owner'::company_role,
  'role reflects the caller''s membership'
);

select is(
  (select headcount from public.portal_company_summaries()),
  2,
  'headcount counts active employees only'
);

select * from finish();
rollback;
