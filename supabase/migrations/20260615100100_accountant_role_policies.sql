-- ============================================================================
-- Nexis — Accountant RLS Policy Updates
-- ============================================================================

-- 1. Update employees select policy
drop policy if exists "employees: staff read" on public.employees;
create policy "employees: staff read" on public.employees
  for select using (
    public.user_role_in_company(company_id) in ('owner','admin','manager','accountant')
  );

-- 2. Update payroll_items select policy
drop policy if exists "payroll_items: select" on public.payroll_items;
create policy "payroll_items: select" on public.payroll_items
  for select using (
    public.user_is_company_admin(company_id)
    or public.user_role_in_company(company_id) = 'accountant'
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

-- 3. Update payslips select policy
drop policy if exists "payslips: select" on public.payslips;
create policy "payslips: select" on public.payslips
  for select using (
    public.user_is_company_admin(company_id)
    or public.user_role_in_company(company_id) = 'accountant'
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

-- 4. Update report_jobs select policy
drop policy if exists "report_jobs: select member" on public.report_jobs;
create policy "report_jobs: select member" on public.report_jobs
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager', 'accountant')
  );

-- 5. Update company_billing select policy
drop policy if exists "billing: admin read" on public.company_billing;
create policy "billing: admin read" on public.company_billing
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'accountant')
  );

-- 6. Update storage objects policies for reports
drop policy if exists "reports_bucket: select admin" on storage.objects;
create policy "reports_bucket: select admin" on storage.objects
  for select using (
    bucket_id = 'reports'
    and public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'manager', 'accountant')
  );

-- 7. Update storage objects policies for payslips
drop policy if exists "payslips_bucket: select" on storage.objects;
create policy "payslips_bucket: select" on storage.objects
  for select using (
    bucket_id = 'payslips'
    and (
      public.user_role_in_company(cast(split_part(name, '/', 1) as uuid)) in ('owner', 'admin', 'accountant')
      or exists (
        select 1 from public.employees
        where id = cast(split_part(name, '/', 2) as uuid)
          and user_id = auth.uid()
      )
    )
  );
