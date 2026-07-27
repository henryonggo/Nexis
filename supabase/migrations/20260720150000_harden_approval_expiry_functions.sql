-- Harden two security-advisor findings raised against the functions added by
-- 20260720143000_agent_cycles_and_approval_expiry.sql. Both are the same
-- class of gap 20260717162021_harden_function_grants_and_search_path.sql
-- already closed for every other function in this schema — this migration
-- just extends that same hardening to the two the previous migration missed.
--
--   1. function_search_path_mutable (WARN) on
--      public.expire_stale_approval_on_update() — the BEFORE UPDATE trigger
--      function never had `search_path` pinned, unlike every other trigger
--      function in this repo (e.g. validate_attendance_liveness, pinned in
--      20260717162021) and unlike expire_stale_approval_requests() sitting
--      right beside it in the same migration (`set search_path = public` in
--      its own function body). Same fix, same style: pin search_path, no
--      behavior change — it still just rewrites NEW.status to 'expired'.
--
--   2. anon_security_definer_function_executable (WARN) on
--      public.expire_stale_approval_requests() — this SECURITY DEFINER sweep
--      bypasses RLS across every company's approval_requests by design (see
--      that migration's comment), but the migration only ever added
--      `grant execute ... to authenticated` and never revoked the default
--      PUBLIC execute grant new functions get in Postgres, so `anon` could
--      still call it. Fix mirrors exactly what 20260717162021 did for every
--      other SECURITY DEFINER function in this schema: revoke from PUBLIC and
--      anon, leave the authenticated grant intact.
--
-- Both statements are idempotent (ALTER FUNCTION ... SET search_path and
-- REVOKE ... are both repeatable with no error if already applied), matching
-- how neighboring migrations are written to survive a `supabase db reset`.

-- 1. Pin search_path on the trigger function.
ALTER FUNCTION public.expire_stale_approval_on_update() SET search_path = public;

-- 2. Revoke the default PUBLIC/anon execute grant on the sweep function.
--    The existing `grant execute ... to authenticated` from
--    20260720143000 is untouched — the scheduled/deploy-time caller uses
--    the service role or an authenticated session, per that migration's
--    comment on scheduling.
revoke execute on function public.expire_stale_approval_requests() from public, anon;
