-- ============================================================================
-- pgTAP tests for the agent approval-token mechanism (ADR 0002):
-- approval_requests RLS + consume_approval RPC + audit_logs agent-tool insert.
-- Run with:  supabase test db   (requires `supabase start`)
-- ============================================================================

begin;
select plan(20);

-- Ensure pgTAP is available.
create extension if not exists pgtap;

-- Fixtures: three auth users — an admin and a regular member of Company A,
-- and an owner of an unrelated Company B (cross-company isolation).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'member-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'stranger-b@test.local');

-- Companies.
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B', '33333333-3333-3333-3333-333333333333');

-- Memberships. member-a is a plain employee — never admin — of Company A.
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'employee'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

-- Pre-seeded (bypassing RLS, as the migration role) approved requests for the
-- negative consume_approval paths — expiry, hash mismatch, tool_name
-- mismatch, cross-company — so each test isolates exactly one failure mode.
insert into approval_requests
  (id, company_id, tool_name, payload_hash, payload, status, requested_by, decided_by, decided_at, expires_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'approve_run', 'hash-expired', '{"runId":"r1"}'::jsonb, 'approved',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', now(),
   now() - interval '1 hour'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'approve_run', 'hash-correct', '{"runId":"r2"}'::jsonb, 'approved',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', now(),
   now() + interval '1 hour'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'mark_run_paid', 'hash-correct-3', '{"runId":"r3"}'::jsonb, 'approved',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', now(),
   now() + interval '1 hour'),
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'approve_run', 'hash-cross-company', '{"runId":"r4"}'::jsonb, 'approved',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', now(),
   now() + interval '1 hour');

-- Helper impersonation (matches local convention across pgTAP suites).
create or replace function tests_authenticate_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end; $$;

-- ── INSERT policy ────────────────────────────────────────────────────────────

-- Test 1: a company member can propose a pending approval request.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
insert into approval_requests (id, company_id, tool_name, payload_hash, payload, summary, requested_by)
values (
  'a0000000-0000-0000-0000-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'approve_run', 'hash-happy-path', '{"runId":"r10"}'::jsonb, 'Setujui payroll run Juli 2026',
  '22222222-2222-2222-2222-222222222222'
);
select is(
  (select status from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  'pending'::approval_request_status,
  'Member can create a pending approval request for their own company'
);

-- Test 2: a member cannot create a request pre-marked as already decided.
select throws_ok(
  $$insert into approval_requests (company_id, tool_name, payload_hash, payload, status, requested_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'approve_run', 'hash-x', '{}'::jsonb, 'approved', '22222222-2222-2222-2222-222222222222')$$,
  '42501',
  null,
  'Member cannot insert a request that is not pending'
);

-- Test 3: a member cannot create a request naming someone else as requester.
select throws_ok(
  $$insert into approval_requests (company_id, tool_name, payload_hash, payload, requested_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'approve_run', 'hash-y', '{}'::jsonb, '11111111-1111-1111-1111-111111111111')$$,
  '42501',
  null,
  'Member cannot impersonate another user as requested_by'
);

-- ── UPDATE "approve/reject" policy ──────────────────────────────────────────

-- Test 4: a non-admin member cannot move a pending request to approved
-- directly. Neither UPDATE policy's USING clause admits a plain member on a
-- pending row, so the row is simply not selected — 0 rows change, no error.
update approval_requests
  set status = 'approved', decided_by = '22222222-2222-2222-2222-222222222222'
  where id = 'a0000000-0000-0000-0000-000000000010';
select is(
  (select status from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  'pending'::approval_request_status,
  'Non-admin member cannot self-approve — pending request is untouched by RLS'
);

-- Test 5: the company admin/owner can approve a pending request.
select tests_authenticate_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$update approval_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where id = 'a0000000-0000-0000-0000-000000000010'$$,
  'Admin can approve a pending request'
);

-- Test 6: status is now approved.
select is(
  (select status from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  'approved'::approval_request_status,
  'Approved request status is now approved'
);

-- Test 7: decided_by recorded the approving admin.
select is(
  (select decided_by from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'decided_by is set to the approving admin'
);

-- Test 8: regression guard for the OR-combination hardening (see migration
-- comment) — a non-admin member must NOT be able to ride the "consume"
-- policy's laxer USING (any member + status = 'approved') to flip an
-- already-approved request to 'rejected' while stamping themselves as the
-- decider. This time the row IS selected (by the consume policy's USING),
-- so a WITH CHECK failure raises a real 42501, not a silent no-op.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$update approval_requests set status = 'rejected', decided_by = '22222222-2222-2222-2222-222222222222'
    where id = 'a0000000-0000-0000-0000-000000000010'$$,
  '42501',
  null,
  'Non-admin member cannot flip an approved request to rejected or impersonate the decider'
);

-- Test 9: the approved request is unaffected by the blocked attempt.
select is(
  (select status from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  'approved'::approval_request_status,
  'Approved request status is unchanged after the blocked non-admin update'
);

-- ── consume_approval RPC ─────────────────────────────────────────────────────

-- Test 10: consume_approval succeeds exactly once for the approved, unexpired,
-- matching request.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select is(
  (select public.consume_approval('a0000000-0000-0000-0000-000000000010', 'approve_run', 'hash-happy-path')),
  true,
  'consume_approval returns true for a matching, approved, unexpired request'
);

-- Test 11: the row is now consumed with consumed_at set.
select is(
  (select status from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  'consumed'::approval_request_status,
  'Request status is now consumed'
);

-- Test 12: consumed_at is set after consumption.
select isnt(
  (select consumed_at from approval_requests where id = 'a0000000-0000-0000-0000-000000000010'),
  null,
  'consumed_at is set after consumption'
);

-- Test 13: double consume — the second call returns false (already consumed).
select is(
  (select public.consume_approval('a0000000-0000-0000-0000-000000000010', 'approve_run', 'hash-happy-path')),
  false,
  'consume_approval returns false on a second, already-consumed call'
);

-- Test 14: expired request — consume_approval returns false even with an
-- otherwise-correct tool_name/payload_hash.
select is(
  (select public.consume_approval('a0000000-0000-0000-0000-000000000001', 'approve_run', 'hash-expired')),
  false,
  'consume_approval returns false for an expired request'
);

-- Test 15: wrong payload_hash — consume_approval returns false.
select is(
  (select public.consume_approval('a0000000-0000-0000-0000-000000000002', 'approve_run', 'hash-tampered')),
  false,
  'consume_approval returns false when the payload hash does not match'
);

-- Test 16: wrong tool_name — consume_approval returns false.
select is(
  (select public.consume_approval('a0000000-0000-0000-0000-000000000003', 'mark_run_unpaid', 'hash-correct-3')),
  false,
  'consume_approval returns false when the tool_name does not match'
);

-- Test 17: cross-company — a user with no access to Company A cannot consume
-- Company A's approval request, even with the exact correct tool_name/hash.
select tests_authenticate_as('33333333-3333-3333-3333-333333333333');
select is(
  (select public.consume_approval('a0000000-0000-0000-0000-000000000004', 'approve_run', 'hash-cross-company')),
  false,
  'consume_approval returns false for a user outside the request''s company'
);

-- ── audit_logs: agent-tool insert policy ────────────────────────────────────

-- Test 18: a company member can write an agent-tool audit row for their own
-- company, naming themselves as actor.
select tests_authenticate_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
            'agent_tool.approve_run', 'agent_tools', null, '{"status":"ok"}'::jsonb)$$,
  'Company member can insert an agent_tools audit row for their own company'
);

-- Test 19: the same member cannot use this policy to write an audit row for
-- any other entity type.
select throws_ok(
  $$insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
            'approve_leave', 'leave_requests', null, '{}'::jsonb)$$,
  '42501',
  null,
  'Agent-tool audit insert policy does not open other entity types'
);

-- Test 20: a member cannot forge another user as the audit actor.
select throws_ok(
  $$insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
            'agent_tool.approve_run', 'agent_tools', null, '{}'::jsonb)$$,
  '42501',
  null,
  'Member cannot forge another user as the audit actor_id'
);

select * from finish();
rollback;
