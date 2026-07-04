-- ============================================================================
-- Nexis — Agent approval-token mechanism (ADR 0002, PIVOT-PHASE-1 Week 2).
--
-- `approval_requests` is the durable row backing "agent proposes → owner
-- confirms → system executes." Agents run RLS-scoped as tenant users — no
-- service role, no bypass (docs/pivot/PIVOT-PHASE-1.md) — so every gate here
-- is enforced by RLS + a SECURITY INVOKER RPC, never SECURITY DEFINER.
-- See docs/adr/0002-approval-token-mechanism.md for the full design.
-- ============================================================================

-- ── Enum ─────────────────────────────────────────────────────────────────────
create type approval_request_status as enum ('pending', 'approved', 'rejected', 'consumed', 'expired');

-- ── approval_requests ────────────────────────────────────────────────────────
create table approval_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  tool_name     text not null,
  payload_hash  text not null,                 -- sha-256 hex, computed app-side (packages/agent-tools)
  payload       jsonb not null,                -- exact proposed tool input, for display in the approval queue
  summary       text,                          -- human-readable proposal (id-ID)
  status        approval_request_status not null default 'pending',
  requested_by  uuid not null default auth.uid() references auth.users(id),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  expires_at    timestamptz not null default (now() + interval '24 hours'),
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index on approval_requests(company_id, status);

alter table approval_requests enable row level security;

-- SELECT: any company member can see the approval queue for their company.
create policy "approval_requests: members read" on approval_requests
  for select using (public.user_has_company_access(company_id));

-- INSERT: any company member may propose a request, only in `pending` state,
-- and only naming themselves as the requester. The agent runtime authenticates
-- as the tenant user it acts on behalf of, so `requested_by` is that identity.
create policy "approval_requests: members create pending" on approval_requests
  for insert with check (
    status = 'pending'
    and requested_by = auth.uid()
    and public.user_has_company_access(company_id)
  );

-- UPDATE "approve/reject": only a company admin/owner may move a pending
-- request to a decided state, and only by recording themselves as decider.
--
-- Hardening note (deviation from the literal ADR wording — see handoff
-- report): Postgres combines permissive RLS policies by OR-ing every
-- applicable USING clause independently from every applicable WITH CHECK
-- clause for the same command — it does NOT pair a policy's own USING with
-- its own WITH CHECK across policies. Two UPDATE policies exist on this
-- table ("approve/reject" and "consume"); the "consume" policy's USING
-- (`user_has_company_access(company_id) and status = 'approved'`) is
-- satisfiable by ANY company member on an already-approved row. Without the
-- `user_is_company_admin(company_id)` clause repeated here in this policy's
-- OWN with check, a non-admin member could ride that laxer USING gate and
-- still satisfy THIS policy's with check (status in ('approved','rejected')
-- and decided_by = auth.uid()) to flip an approved request to 'rejected'
-- while stamping themselves as the decider — corrupting the audit trail
-- without ever passing this policy's admin-only USING gate. Re-asserting the
-- admin check inside the with check closes that gap; each policy's with
-- check is now self-sufficient regardless of which policy's USING admitted
-- the row.
create policy "approval_requests: admin decide" on approval_requests
  for update using (
    public.user_is_company_admin(company_id)
    and status = 'pending'
  )
  with check (
    public.user_is_company_admin(company_id)
    and status in ('approved', 'rejected')
    and decided_by = auth.uid()
  );

-- UPDATE "consume": once approved, any company member (in practice, the
-- agent runtime acting under the requester's or an operator's session, via
-- the `consume_approval` RPC below) may transition the row to `consumed`.
-- The RPC layers the real single-use guarantee (tool_name/payload_hash/
-- expiry match) on top of this — this policy alone only gates the bare
-- state transition, matching the ADR's "single RPC verifies" design.
create policy "approval_requests: consume" on approval_requests
  for update using (
    public.user_has_company_access(company_id)
    and status = 'approved'
  )
  with check (
    status = 'consumed'
  );

-- No delete policy: approval requests are never deleted, only decided,
-- consumed, or left to expire (a scheduled job may later flip stale
-- `pending`/`approved` rows to `expired` — TODO(app)/TODO(db) if/when that
-- job is scoped; out of ADR 0002's Week 2 slice).

-- ── consume_approval RPC ─────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose (ADR 0002, PIVOT-PHASE-1 "agents get NO
-- bypass"): the caller's own RLS applies to the UPDATE below, via the
-- "approval_requests: consume" policy — a caller who cannot access the
-- company, or whose row isn't `approved`, simply updates zero rows.
--
-- Parameter names intentionally match the columns they compare against
-- (`tool_name`, `payload_hash`) to match the `packages/agent-tools` RPC call
-- shape (`ctx.supabase.rpc("consume_approval", { request_id, tool_name,
-- payload_hash })` — supabase-js maps object keys to parameter names). This
-- means bare column references inside the function body would resolve to
-- the PL/pgSQL parameter, not the table column (parameters shadow columns of
-- the same name), and e.g. `where tool_name = tool_name` would silently
-- always be true. Every comparison below is fully qualified with the table
-- name (existing row) or the function name (parameter) to avoid that trap.
create or replace function public.consume_approval(
  request_id uuid,
  tool_name text,
  payload_hash text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.approval_requests
  set status = 'consumed',
      consumed_at = now()
  where approval_requests.id = consume_approval.request_id
    and approval_requests.tool_name = consume_approval.tool_name
    and approval_requests.payload_hash = consume_approval.payload_hash
    and approval_requests.status = 'approved'
    and approval_requests.expires_at > now();

  return found;
end;
$$;

grant execute on function public.consume_approval(uuid, text, text) to authenticated;

-- ── audit_logs: agent-tool execution audit rows ─────────────────────────────
-- `audit_logs` (created in 20260604120000_stage5_leave_claims.sql) has RLS
-- enabled with only an "audit: admin read" SELECT policy — every existing
-- writer is a SECURITY DEFINER RPC (owned by the migration role, which
-- bypasses RLS as the table owner), so no INSERT policy existed yet. Agent
-- tools are different: `executeTool` (packages/agent-tools/src/tool.ts)
-- inserts directly as the RLS-scoped tenant user, so it needs an explicit
-- INSERT policy, scoped narrowly to `entity = 'agent_tools'` so this grant
-- cannot be used to forge audit rows for any other entity type.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'audit_logs' and policyname = 'audit_logs: agent tool insert'
  ) then
    create policy "audit_logs: agent tool insert" on public.audit_logs
      for insert with check (
        entity = 'agent_tools'
        and company_id is not null
        and public.user_has_company_access(company_id)
        and (actor_id = auth.uid() or actor_id is null)
      );
  end if;
end $$;

-- TODO(app): the approval-queue UX (Phase 1's only new UI, per
-- PIVOT-PHASE-1.md) needs to read `approval_requests` for the operator's
-- companies, render `payload`/`summary`, and issue the "approve/reject"
-- UPDATE (set status + decided_by = auth.uid()) — wire this once
-- `packages/types` regenerates with this table.
