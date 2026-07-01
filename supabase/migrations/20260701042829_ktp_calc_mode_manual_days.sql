-- Nexis — KTP identity, daily_calc_mode, and per-run manual days
-- Date: 2026-07-01
--
-- Additive only. Existing rows unaffected (nullable ktp; daily_calc_mode
-- defaults 'manual'; new table starts empty). Satisfies architect contract:
-- Decision 1 (KTP identity), Decision 2 (manual/attendance branch), Decision 3
-- (reproducible per-run manual days + draft-only RPC).

-- ── 1. tax_profile: add ktp column ──────────────────────────────────────────
--   Stores the 16-digit NIK used as interchangeable tax identity.
--   Nullable so existing rows are unaffected.
alter table public.tax_profile
  add column if not exists ktp text null
    constraint tax_profile_ktp_format_check
    check (ktp is null or ktp ~ '^[0-9]{16}$');

-- ── 2. compensation: add daily_calc_mode column ──────────────────────────────
--   Governs whether the daily portion is entered manually by the admin or
--   auto-derived from attendance_records. Default 'manual' = safe fallback
--   (never silently pulls attendance the admin didn't opt into).
alter table public.compensation
  add column if not exists daily_calc_mode text not null default 'manual'
    constraint compensation_daily_calc_mode_check
    check (daily_calc_mode in ('manual', 'attendance'));

-- ── 3. payroll_run_manual_days: new table ────────────────────────────────────
--   Persists the admin-entered working days per (run, employee) so that the
--   review screen and the Cloud Run worker read the identical number
--   (reproducibility invariant). Keyed by UNIQUE (payroll_run_id, employee_id)
--   for clean ON CONFLICT upserts. CASCADE on run delete to avoid orphans.
create table public.payroll_run_manual_days (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id)     on delete cascade,
  payroll_run_id uuid        not null references public.payroll_runs(id)  on delete cascade,
  employee_id    uuid        not null references public.employees(id),
  days_worked    integer     not null default 0
                               check (days_worked >= 0 and days_worked <= 31),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

create index on public.payroll_run_manual_days (company_id);
create index on public.payroll_run_manual_days (payroll_run_id);
create index on public.payroll_run_manual_days (employee_id);

-- ── 4. RLS for payroll_run_manual_days ───────────────────────────────────────
alter table public.payroll_run_manual_days enable row level security;

-- Any member of the company may SELECT (to view their run's days).
create policy "payroll_run_manual_days: member read"
  on public.payroll_run_manual_days
  for select
  using (public.user_has_company_access(company_id));

-- Only owner/admin may mutate rows (real mutations go through the RPC below
-- which adds the draft-status guard; direct DML is also restricted here).
create policy "payroll_run_manual_days: admin write"
  on public.payroll_run_manual_days
  for all
  using  (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

-- ── 5. set_run_manual_days RPC ───────────────────────────────────────────────
--   SECURITY DEFINER enforces:
--     (a) caller is owner/admin of the run's company, and
--     (b) the run is still in 'draft' status.
--   Both guards are atomic; RLS alone cannot express the status check.
--   p_days is clamped to [0, 31] before storage.
create or replace function public.set_run_manual_days(
  p_run_id      uuid,
  p_employee_id uuid,
  p_days        integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_status     pay_period_status;
  v_clamped    integer;
begin
  -- Resolve company and status from the payroll_runs row.
  select company_id, status
    into v_company_id, v_status
  from public.payroll_runs
  where id = p_run_id;

  if v_company_id is null then
    raise exception 'RUN_NOT_FOUND';
  end if;

  -- Only admin/owner of the run's company may call this.
  if not public.user_is_company_admin(v_company_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Draft-only invariant: days cannot be changed once the run leaves draft.
  if v_status <> 'draft' then
    raise exception 'RUN_NOT_EDITABLE';
  end if;

  -- Clamp to 0..31 (mirrors the table CHECK constraint).
  v_clamped := greatest(0, least(31, p_days));

  -- Upsert the manual-days row for this (run, employee) pair.
  insert into public.payroll_run_manual_days
    (company_id, payroll_run_id, employee_id, days_worked, updated_at)
  values
    (v_company_id, p_run_id, p_employee_id, v_clamped, now())
  on conflict (payroll_run_id, employee_id)
  do update set
    days_worked = v_clamped,
    updated_at  = now();
end;
$$;

grant execute on function public.set_run_manual_days(uuid, uuid, integer) to authenticated;
