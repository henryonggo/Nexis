-- ============================================================================
-- pgTAP: Nexis Lite schema cut (ADR 0007) — dropped objects are gone and the
-- core writes the webhook triggers used to sit on still succeed.
-- Run with:  supabase test db
-- ============================================================================

begin;
select plan(9);

create extension if not exists pgtap;

-- Dropped tables
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
      'job_openings', 'candidates', 'applications', 'interviews',
      'review_cycles', 'performance_goals', 'performance_reviews',
      'company_api_keys', 'api_request_logs', 'company_webhooks',
      'webhook_queue', 'webhook_logs', 'company_sso', 'company_scim_tokens')),
  0,
  'Recruitment, performance, API/webhook and SSO/SCIM tables are gone'
);

-- Dropped functions
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'portal_company_summaries', 'process_webhook_events_trigger',
      'hire_application', 'submit_review', 'acknowledge_review',
      'generate_api_key', 'generate_scim_token', 'get_scim_users',
      'get_scim_user_by_id', 'scim_set_user_active', 'get_user_id_by_email')),
  0,
  'Domain RPCs and the webhook trigger function are gone'
);

select hasnt_column('public', 'company_employee_access', 'nav_style',
  'nav_style column is gone');

select is(
  (select count(*)::int from pg_trigger
    where not tgisinternal and tgname in
      ('tr_webhook_employee', 'tr_webhook_attendance', 'tr_webhook_payroll')),
  0,
  'No webhook triggers remain on core tables'
);

-- Fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local');
insert into companies (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');
insert into company_members (company_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

-- Core writes that used to fire process_webhook_events_trigger
select lives_ok(
  $$ insert into employees (id, company_id, full_name)
     values ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Emp One') $$,
  'Inserting an employee still succeeds'
);

select lives_ok(
  $$ update employees set full_name = 'Emp One Renamed'
     where id = 'e1111111-1111-1111-1111-111111111111' $$,
  'Updating an employee still succeeds'
);

select lives_ok(
  $$ insert into attendance_records (company_id, employee_id, kind, event_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'e1111111-1111-1111-1111-111111111111', 'clock_in', now()) $$,
  'Inserting a clock_in attendance record still succeeds'
);

insert into payroll_runs (id, company_id, period_year, period_month, status) values
  ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 10, 'draft');

select lives_ok(
  $$ update payroll_runs set status = 'completed', completed_at = now()
     where id = '70000000-0000-0000-0000-000000000001' $$,
  'Completing a payroll run still succeeds'
);

select is(
  (select status::text from payroll_runs where id = '70000000-0000-0000-0000-000000000001'),
  'completed',
  'Payroll run is completed'
);

select * from finish();
rollback;
