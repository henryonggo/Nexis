-- ============================================================================
-- Nexis Lite schema cut (ADR 0007, "Backend").
-- Drops the frozen recruitment, performance, public-API/webhook, SSO/SCIM and
-- portal objects plus company_employee_access.nav_style, and everything that
-- would otherwise break at runtime once they are gone.
--
-- DESTRUCTIVE. The guard below aborts the whole migration if any dropped table
-- (or the 'resumes' storage bucket) holds data. If it fires, export or clear
-- the named table first, then re-run.
-- ============================================================================

-- ── 0. Data-loss guard ───────────────────────────────────────────────────────
do $$
declare
  t text;
  has_rows boolean;
begin
  foreach t in array array[
    'job_openings', 'candidates', 'applications', 'interviews',
    'review_cycles', 'performance_goals', 'performance_reviews',
    'company_api_keys', 'api_request_logs', 'company_webhooks',
    'webhook_queue', 'webhook_logs',
    'company_sso', 'company_scim_tokens'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select exists (select 1 from public.%I)', t) into has_rows;
      if has_rows then
        raise exception 'nexis_lite_schema_cut aborted: public.% still has rows; export or clear it first', t;
      end if;
    end if;
  end loop;

  if to_regclass('storage.objects') is not null
     and exists (select 1 from storage.objects where bucket_id = 'resumes') then
    raise exception 'nexis_lite_schema_cut aborted: storage bucket "resumes" still has objects; export or clear it first';
  end if;
end $$;

-- ── 1. Webhook-enqueue triggers on CORE tables ───────────────────────────────
-- The function body inserts into webhook_queue; CASCADE would NOT remove that
-- reference, so the triggers and function must go before the tables.
drop trigger if exists tr_webhook_employee   on public.employees;
drop trigger if exists tr_webhook_attendance on public.attendance_records;
drop trigger if exists tr_webhook_payroll    on public.payroll_runs;
drop function if exists public.process_webhook_events_trigger();

-- ── 2. Domain RPCs / helpers ────────────────────────────────────────────────
drop function if exists public.portal_company_summaries();
drop function if exists public.hire_application(uuid);
drop function if exists public.submit_review(uuid);
drop function if exists public.acknowledge_review(uuid);
drop function if exists public.generate_api_key(uuid, text, text[], timestamptz);
drop function if exists public.generate_scim_token(uuid, timestamptz);
drop function if exists public.get_scim_users(uuid, text);
drop function if exists public.get_scim_user_by_id(uuid, uuid);
drop function if exists public.scim_set_user_active(uuid, uuid, boolean);
-- Only consumer was the scim Edge Function (deleted).
drop function if exists public.get_user_id_by_email(text);

-- ── 3. Tables (children first; dropping also removes policies, indexes and
--       supabase_realtime publication entries) ────────────────────────────────
drop table if exists public.interviews           cascade;
drop table if exists public.applications         cascade;
drop table if exists public.candidates           cascade;
drop table if exists public.job_openings         cascade;

drop table if exists public.performance_reviews  cascade;
drop table if exists public.performance_goals    cascade;
drop table if exists public.review_cycles        cascade;

drop table if exists public.webhook_logs         cascade;
drop table if exists public.webhook_queue        cascade;
drop table if exists public.company_webhooks     cascade;
drop table if exists public.api_request_logs     cascade;
drop table if exists public.company_api_keys     cascade;

drop table if exists public.company_scim_tokens  cascade;
drop table if exists public.company_sso          cascade;

-- ── 4. Enums that only these tables used ─────────────────────────────────────
drop type if exists public.interview_outcome;
drop type if exists public.application_stage;
drop type if exists public.job_opening_status;
drop type if exists public.review_status;
drop type if exists public.goal_status;

-- ── 5. Resume storage (bucket + policies) ────────────────────────────────────
drop policy if exists "resumes_bucket: select" on storage.objects;
drop policy if exists "resumes_bucket: write"  on storage.objects;

-- Storage blocks direct bucket deletes unless explicitly allowed; the guard
-- above already proved the bucket is empty.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.buckets where id = 'resumes';

-- ── 6. nav_style column (and its check constraint) ──────────────────────────
alter table public.company_employee_access
  drop constraint if exists company_employee_access_nav_style_check;
alter table public.company_employee_access
  drop column if exists nav_style;
