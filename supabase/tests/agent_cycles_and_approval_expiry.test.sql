-- ============================================================================
-- pgTAP tests for NEXT-4 (db slice): agent_cycles RLS + approval_requests
-- expiry hardening (BEFORE UPDATE trigger + expire_stale_approval_requests()).
-- Also covers the 20260720150000 security-advisor follow-up (search_path
-- pin on the trigger function is behavior-invisible, so re-uses tests 1/2
-- below; the anon-execute revoke on the sweep function gets its own check,
-- test 19).
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(19);

create extension if not exists pgtap;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Company A: an admin/owner and a plain employee. Company B: an unrelated
-- owner, for cross-company isolation checks.
insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'admin-a@test.local'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'member-a@test.local'),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'owner-b@test.local');

insert into companies (id, name, created_by) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'Company A', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'Company B', 'b2b2b2b2-0000-0000-0000-000000000001');

insert into company_members (company_id, user_id, role) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'a1a1a1a1-0000-0000-0000-000000000001', 'owner'),
  ('a1a1a1a1-1111-1111-1111-111111111111', 'a1a1a1a1-0000-0000-0000-000000000002', 'employee'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'b2b2b2b2-0000-0000-0000-000000000001', 'owner');

-- Pre-seeded (bypassing RLS, as the migration role) approval_requests fixtures:
--   ...01  pending, already expired    — trigger-on-approve target
--   ...02  pending, already expired    — sweep target
--   ...03  approved, already expired   — sweep target + consume_approval check
--   ...04  pending, not yet expired    — sweep control (must survive)
--   ...05  approved, not yet expired   — sweep control (must survive)
insert into approval_requests
  (id, company_id, tool_name, payload_hash, payload, status, requested_by, expires_at)
values
  ('cccccccc-0000-0000-0000-000000000001', 'a1a1a1a1-1111-1111-1111-111111111111',
   'approve_run', 'hash-01', '{"runId":"r1"}'::jsonb, 'pending',
   'a1a1a1a1-0000-0000-0000-000000000002', now() - interval '2 hours'),
  ('cccccccc-0000-0000-0000-000000000002', 'a1a1a1a1-1111-1111-1111-111111111111',
   'approve_run', 'hash-02', '{"runId":"r2"}'::jsonb, 'pending',
   'a1a1a1a1-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('cccccccc-0000-0000-0000-000000000003', 'a1a1a1a1-1111-1111-1111-111111111111',
   'approve_run', 'hash-03', '{"runId":"r3"}'::jsonb, 'approved',
   'a1a1a1a1-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('cccccccc-0000-0000-0000-000000000004', 'a1a1a1a1-1111-1111-1111-111111111111',
   'approve_run', 'hash-04', '{"runId":"r4"}'::jsonb, 'pending',
   'a1a1a1a1-0000-0000-0000-000000000002', now() + interval '1 hour'),
  ('cccccccc-0000-0000-0000-000000000005', 'a1a1a1a1-1111-1111-1111-111111111111',
   'approve_run', 'hash-05', '{"runId":"r5"}'::jsonb, 'approved',
   'a1a1a1a1-0000-0000-0000-000000000002', now() + interval '1 hour');

create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── Trigger: approving an already-expired request lands as 'expired' ───────

-- Test 1: the admin's UPDATE itself does not fail — the trigger silently
-- redirects the outcome instead of the whole statement raising an RLS error.
select tests_authenticate_as('a1a1a1a1-0000-0000-0000-000000000001');
select lives_ok(
  $$update approval_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'Admin approving an already-expired request does not raise an RLS violation'
);

-- Test 2: the resulting status is 'expired', never a live 'approved' row.
select is(
  (select status from approval_requests where id = 'cccccccc-0000-0000-0000-000000000001'),
  'expired'::approval_request_status,
  'Approving a stale request lands as expired, not approved'
);

-- Test 3: the decision still lands — decided_by is recorded even though the
-- outcome was redirected to expired.
select is(
  (select decided_by from approval_requests where id = 'cccccccc-0000-0000-0000-000000000001'),
  'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
  'decided_by is still recorded on the redirected-to-expired row'
);

-- ── expire_stale_approval_requests(): sweep ─────────────────────────────────

-- Test 4: the sweep returns exactly 2 — the two stale rows left untouched by
-- test 1..3 (request 01 is already 'expired' by now, so out of scope).
select is(
  (select public.expire_stale_approval_requests()),
  2,
  'expire_stale_approval_requests() flips exactly the stale pending/approved rows'
);

-- Test 5: the stale pending row (02) is now expired.
select is(
  (select status from approval_requests where id = 'cccccccc-0000-0000-0000-000000000002'),
  'expired'::approval_request_status,
  'Sweep flips a stale pending row to expired'
);

-- Test 6: the stale approved row (03) is now expired.
select is(
  (select status from approval_requests where id = 'cccccccc-0000-0000-0000-000000000003'),
  'expired'::approval_request_status,
  'Sweep flips a stale approved row to expired'
);

-- Test 7: the not-yet-expired pending row (04) is untouched.
select is(
  (select status from approval_requests where id = 'cccccccc-0000-0000-0000-000000000004'),
  'pending'::approval_request_status,
  'Sweep leaves a not-yet-expired pending row alone'
);

-- Test 8: the not-yet-expired approved row (05) is untouched.
select is(
  (select status from approval_requests where id = 'cccccccc-0000-0000-0000-000000000005'),
  'approved'::approval_request_status,
  'Sweep leaves a not-yet-expired approved row alone'
);

-- Test 9: a second sweep call is idempotent — nothing left to flip.
select is(
  (select public.expire_stale_approval_requests()),
  0,
  'A second sweep call finds nothing left to expire'
);

-- ── consume_approval on an expired row ──────────────────────────────────────

-- Test 10: consume_approval still fails on a row the sweep expired, even
-- with the exact matching tool_name/payload_hash.
select tests_authenticate_as('a1a1a1a1-0000-0000-0000-000000000002');
select is(
  (select public.consume_approval('cccccccc-0000-0000-0000-000000000003', 'approve_run', 'hash-03')),
  false,
  'consume_approval returns false for a row the sweep expired'
);

-- ── agent_cycles RLS ─────────────────────────────────────────────────────────

-- Test 11: a company member can log a cycle for their own company, naming
-- themselves as the starter.
select tests_authenticate_as('a1a1a1a1-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into agent_cycles (id, company_id, instruction, status, started_by, started_at)
    values ('dddddddd-0000-0000-0000-000000000001', 'a1a1a1a1-1111-1111-1111-111111111111',
            'Jalankan payroll Juli 2026', 'completed', 'a1a1a1a1-0000-0000-0000-000000000002', now())$$,
  'Member can insert an agent_cycles row for their own company'
);

-- Test 12: the row was stored with the expected status.
select is(
  (select status from agent_cycles where id = 'dddddddd-0000-0000-0000-000000000001'),
  'completed'::agent_cycle_status,
  'Inserted agent_cycles row keeps its status'
);

-- Test 13: a member cannot log a cycle naming someone else as the starter.
select throws_ok(
  $$insert into agent_cycles (company_id, instruction, status, started_by, started_at)
    values ('a1a1a1a1-1111-1111-1111-111111111111', 'x', 'completed',
            'a1a1a1a1-0000-0000-0000-000000000001', now())$$,
  '42501',
  null,
  'Member cannot impersonate another user as started_by'
);

-- Test 14: a member cannot log a cycle for a company they have no access to.
select throws_ok(
  $$insert into agent_cycles (company_id, instruction, status, started_by, started_at)
    values ('b2b2b2b2-2222-2222-2222-222222222222', 'x', 'completed',
            'a1a1a1a1-0000-0000-0000-000000000002', now())$$,
  '42501',
  null,
  'Member cannot log a cycle for a company they do not belong to'
);

-- Test 15: a company member can read their own company's cycle log.
select is(
  (select count(*)::int from agent_cycles where company_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  1,
  'Company member can select their own company''s agent_cycles rows'
);

-- Test 16: a user outside the company cannot see its cycle log at all —
-- cross-company SELECT returns zero rows, not an error.
select tests_authenticate_as('b2b2b2b2-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from agent_cycles where id = 'dddddddd-0000-0000-0000-000000000001'),
  0,
  'Cross-company user cannot select another company''s agent_cycles row'
);

-- Test 17: nobody can UPDATE an agent_cycles row — no UPDATE policy exists,
-- so RLS admits zero rows and the statement is a silent no-op.
select tests_authenticate_as('a1a1a1a1-0000-0000-0000-000000000001');
update agent_cycles set status = 'error' where id = 'dddddddd-0000-0000-0000-000000000001';
select is(
  (select status from agent_cycles where id = 'dddddddd-0000-0000-0000-000000000001'),
  'completed'::agent_cycle_status,
  'agent_cycles rows cannot be updated by anyone, including the company owner'
);

-- Test 18: nobody can DELETE an agent_cycles row either.
delete from agent_cycles where id = 'dddddddd-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from agent_cycles where id = 'dddddddd-0000-0000-0000-000000000001'),
  1,
  'agent_cycles rows cannot be deleted by anyone, including the company owner'
);

-- ── 20260720150000 hardening: anon must not execute the sweep function ─────

-- Test 19: anon has no EXECUTE privilege on the SECURITY DEFINER sweep —
-- only the default-PUBLIC grant was ever missing a revoke (the explicit
-- `grant ... to authenticated` from 20260720143000 is untouched and is not
-- what this checks).
select is(
  has_function_privilege('anon', 'public.expire_stale_approval_requests()', 'execute'),
  false,
  'anon cannot execute the SECURITY DEFINER approval-expiry sweep'
);

select * from finish();
rollback;
