-- Nexis — Create filing_submissions table for government filing integration ledger
create table if not exists public.filing_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  kind text not null check (kind in ('djp', 'sipp')),
  status text not null check (status in ('queued', 'submitted', 'accepted', 'rejected')) default 'queued',
  external_ref text,
  response_payload jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists filing_submissions_company_idx on public.filing_submissions(company_id);
create index if not exists filing_submissions_run_idx on public.filing_submissions(run_id);

-- Enable RLS
alter table public.filing_submissions enable row level security;

-- RLS Policies
-- Owners and Admins can read the filing ledger for their company
create policy "filing_submissions: select admin" on public.filing_submissions
  for select using (public.user_role_in_company(company_id) in ('owner', 'admin'));
