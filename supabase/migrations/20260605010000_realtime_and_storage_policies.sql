-- ============================================================================
-- Nexis — Stage 6 Addition: Realtime publications & storage policies updates
-- ============================================================================

-- ── 1. Realtime Publication Settings ───────────────────────────────────────
-- Add payroll_runs, attendance_records, and report_jobs to realtime stream.

alter publication supabase_realtime add table public.payroll_runs;
alter publication supabase_realtime add table public.attendance_records;
alter publication supabase_realtime add table public.report_jobs;

-- ── 2. Private Storage Select Policies for Managers ─────────────────────────
-- Extend select access on files related to attendance, leaves, claims, and reports
-- to users with the 'manager' role in the company.

-- attendance-selfies select policy
drop policy if exists "attendance-selfies: select" on storage.objects;
create policy "attendance-selfies: select" on storage.objects
  for select using (
    bucket_id = 'attendance-selfies'
    and (
      auth.uid() = owner
      or public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager')
    )
  );

-- selfies select policy
drop policy if exists "selfies: select" on storage.objects;
create policy "selfies: select" on storage.objects
  for select using (
    bucket_id = 'selfies'
    and (
      auth.uid() = owner
      or public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager')
    )
  );

-- leave-attachments select policy
drop policy if exists "leave-attachments: select" on storage.objects;
create policy "leave-attachments: select" on storage.objects
  for select using (
    bucket_id = 'leave-attachments'
    and (
      public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager')
      or exists (
        select 1 from public.employees
        where id = cast(split_part(name, '/', 2) as uuid)
          and user_id = auth.uid()
      )
    )
  );

-- claim-receipts select policy
drop policy if exists "claim-receipts: select" on storage.objects;
create policy "claim-receipts: select" on storage.objects
  for select using (
    bucket_id = 'claim-receipts'
    and (
      public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager')
      or exists (
        select 1 from public.employees
        where id = cast(split_part(name, '/', 2) as uuid)
          and user_id = auth.uid()
      )
    )
  );

-- reports select policy
drop policy if exists "reports_bucket: select admin" on storage.objects;
create policy "reports_bucket: select admin" on storage.objects
  for select using (
    bucket_id = 'reports'
    and public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager')
  );
