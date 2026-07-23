-- ============================================================================
-- Nexis — Agent cycle log + approval-request expiry hardening (NEXT-4).
--
-- Two independent pieces, grouped in one migration because both close gaps
-- in ADR 0002's agent/approval mechanism:
--
--   1. `agent_cycles` — a durable parent record per orchestrator run
--      (packages/orchestrator/src/driver.ts). Today a dry run can only be
--      reconstructed after the fact from `audit_logs` rows; this table gives
--      the run itself a first-class row (append-only log, RLS SELECT/INSERT
--      only — no UPDATE, no DELETE, matching the "audit trail" shape used
--      elsewhere in this schema).
--
--   2. Approval expiry (CODE-REVIEW-2026-07): `consume_approval` already
--      refuses an expired-but-`approved` row, but nothing ever flips that
--      row's status — an admin could click "approve" on an already-expired
--      request and leave a permanently dead `approved` row sitting in the
--      queue forever, indistinguishable at a glance from a live one. A
--      BEFORE UPDATE trigger now redirects that specific transition to
--      `expired`, and a sweep function flips any other stale `pending`/
--      `approved` row on a schedule.
-- ============================================================================

-- ── 1. agent_cycle_status enum ──────────────────────────────────────────────
-- Mirrors `CycleResult["status"]` (packages/orchestrator/src/events.ts) —
-- note that source type currently has SIX members (it also has "max_turns",
-- for a cycle that stopped after hitting the turn budget without resolving);
-- this enum matches the source of truth rather than a stale five-member
-- list, so every real CycleResult can be persisted without a write failure.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agent_cycle_status') then
    create type agent_cycle_status as enum (
      'completed', 'awaiting_approval', 'halted', 'error', 'refusal', 'max_turns'
    );
  end if;
end $$;

-- ── 2. agent_cycles ──────────────────────────────────────────────────────────
create table if not exists agent_cycles (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  instruction         text not null,
  status              agent_cycle_status not null,
  final_text          text,
  halts               jsonb not null default '[]',        -- HaltReason[] (packages/agent-tools/src/result.ts)
  pending_request_ids uuid[] not null default '{}',        -- approval_requests.id opened this cycle
  started_by          uuid not null default auth.uid() references auth.users(id),
  started_at          timestamptz not null,
  finished_at         timestamptz not null default now()
);

create index if not exists agent_cycles_company_id_finished_at_idx
  on agent_cycles(company_id, finished_at desc);

alter table agent_cycles enable row level security;

-- INSERT: any company member may log a cycle for their own company, only
-- naming themselves as the starter — the orchestrator runs RLS-scoped as the
-- tenant user it acts on behalf of (no service role, no bypass), matching
-- the `approval_requests` insert policy's shape.
drop policy if exists "agent_cycles: members insert own" on agent_cycles;
create policy "agent_cycles: members insert own" on agent_cycles
  for insert with check (
    started_by = auth.uid()
    and public.user_has_company_access(company_id)
  );

-- SELECT: any company member can read their own company's cycle log.
drop policy if exists "agent_cycles: members read" on agent_cycles;
create policy "agent_cycles: members read" on agent_cycles
  for select using (public.user_has_company_access(company_id));

-- No UPDATE, no DELETE policy: agent_cycles is an append-only log, same as
-- audit_logs — a finished cycle's record never changes or disappears. With
-- RLS enabled and no policy for those commands, every UPDATE/DELETE is
-- denied by default (0 rows visible), for every role including admins.

-- TODO(app): surface `agent_cycles` as the run history behind the
-- approval-queue / dry-run UX (docs/pivot/PIVOT-PHASE-1.md) — insert one row
-- per `runPayrollCycle` invocation (packages/orchestrator/src/driver.ts) and
-- list it on `/approvals` or a dedicated "agent activity" view once
-- `packages/types` regenerates with this table.

-- ── 3. approval_requests: expiry hardening ──────────────────────────────────

-- 3a. BEFORE UPDATE trigger: a transition to `approved` on an already-expired
-- request lands as `expired` instead — the decision is still recorded
-- (decided_by/decided_at unchanged), it just never becomes a live,
-- consumable approval. Plain trigger (no SECURITY DEFINER needed — it only
-- rewrites the NEW row already in scope of the caller's own UPDATE), same
-- shape as `validate_attendance_liveness`
-- (20260615100700_attendance_liveness_policy.sql).
create or replace function public.expire_stale_approval_on_update()
returns trigger
language plpgsql as $$
begin
  new.status := 'expired';
  return new;
end; $$;

drop trigger if exists trg_expire_stale_approval_on_approve on approval_requests;
create trigger trg_expire_stale_approval_on_approve
  before update of status on approval_requests
  for each row
  when (new.status = 'approved' and new.expires_at < now())
  execute function public.expire_stale_approval_on_update();

-- 3b. The "admin decide" UPDATE policy's WITH CHECK (20260704020000) only
-- allowed the new row to land as 'approved' or 'rejected' — with the trigger
-- above now able to rewrite an admin's own "approve" into 'expired' mid
-- statement, that WITH CHECK must accept 'expired' as a legitimate outcome
-- of the same admin-only decision, or the admin's UPDATE would fail with a
-- policy violation instead of quietly landing as an expiry. This still
-- requires `user_is_company_admin` and `decided_by = auth.uid()`, so it does
-- NOT reopen the OR-combination gap documented in the original migration —
-- a non-admin still cannot satisfy this policy's WITH CHECK by any route.
drop policy if exists "approval_requests: admin decide" on approval_requests;
create policy "approval_requests: admin decide" on approval_requests
  for update using (
    public.user_is_company_admin(company_id)
    and status = 'pending'
  )
  with check (
    public.user_is_company_admin(company_id)
    and status in ('approved', 'rejected', 'expired')
    and decided_by = auth.uid()
  );

-- 3c. Sweep function: flips any stale `pending`/`approved` row (nobody ever
-- acted on it, or it was approved and never consumed before expiry) to
-- `expired`. SECURITY DEFINER + bypasses RLS on purpose — this is a
-- system-wide maintenance sweep across every company's queue, not a
-- tenant-scoped action, matching `refresh_active_seats`
-- (20260602130000_stage2_employees_invites.sql). It only enforces a fact
-- that is already true for the row (`expires_at < now()`) and returns
-- nothing but a count, so granting it to `authenticated` (this repo's
-- consistent grant target — no service_role convention exists here) leaks
-- no data and cannot be used to force any other outcome.
create or replace function public.expire_stale_approval_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.approval_requests
    set status = 'expired'
    where status in ('pending', 'approved')
      and expires_at < now()
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$$;

grant execute on function public.expire_stale_approval_requests() to authenticated;

-- 3d. Scheduling: this project has no pg_cron precedent (no existing
-- migration installs or references it) and AGENTS.md names GCP Cloud
-- Scheduler, not pg_cron, as the cron mechanism for this stack. Scheduling
-- `expire_stale_approval_requests()` hourly is therefore a deploy-time
-- decision, not a migration-time one — e.g. a Cloud Scheduler job hitting a
-- thin Edge Function that calls `select expire_stale_approval_requests();`
-- with the service role, or (if pg_cron is later enabled on the Postgres
-- instance) `select cron.schedule('expire-stale-approvals', '0 * * * *',
-- $$select public.expire_stale_approval_requests()$$);`. The function above
-- is safe to call from either path today.
