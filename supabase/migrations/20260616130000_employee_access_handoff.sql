-- Nexis — Fix employee access settings table handoff

create table public.company_employee_access (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  attendance  boolean not null default true,
  leave       boolean not null default true,
  claims      boolean not null default true,
  salary      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Enable RLS
alter table public.company_employee_access enable row level security;

-- RLS select policy: any company member may read
create policy "access: company members read" on public.company_employee_access
  for select using (public.user_has_company_access(company_id));

-- RLS insert/update/delete policy: restricted to company owner/admin
create policy "access: admin insert" on public.company_employee_access
  for insert with check (public.user_is_company_admin(company_id));

create policy "access: admin update" on public.company_employee_access
  for update using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

create policy "access: admin delete" on public.company_employee_access
  for delete using (public.user_is_company_admin(company_id));
