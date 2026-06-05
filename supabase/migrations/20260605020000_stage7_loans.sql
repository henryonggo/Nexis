-- ============================================================================
-- Nexis — Stage 7 Migration: Employee Loans & Advances (Kasbon)
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.loan_status as enum (
  'pending',
  'approved',
  'active',
  'settled',
  'rejected',
  'cancelled'
);

-- ── 1. Employee Loans Table ──────────────────────────────────────────────────
create table public.employee_loans (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  principal           bigint not null check (principal > 0), -- Whole Rupiah (AGENTS.md Rule 3)
  installments        int not null check (installments between 1 and 60), -- Duration in months
  installment_amount  bigint not null check (installment_amount >= 0), -- Principal / installments
  reason              text,
  status              public.loan_status not null default 'pending',
  decision_note       text,
  decided_at          timestamptz,
  decided_by          uuid references auth.users(id) on delete set null,
  disbursed_at        timestamptz,
  next_due_year       int,
  next_due_month      int,
  created_at          timestamptz not null default now()
);

create index on public.employee_loans(company_id);
create index on public.employee_loans(employee_id);
create index on public.employee_loans(status);

-- ── 2. Loan Installments Table ───────────────────────────────────────────────
create table public.loan_installments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  loan_id             uuid not null references public.employee_loans(id) on delete cascade,
  sequence            int not null, -- Month 1, 2, 3...
  due_year            int not null,
  due_month           int not null check (due_month between 1 and 12),
  amount              bigint not null check (amount >= 0),
  status              text not null check (status in ('scheduled', 'deducted', 'skipped')) default 'scheduled',
  payroll_run_id      uuid references public.payroll_runs(id) on delete set null,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  unique (loan_id, sequence)
);

create index on public.loan_installments(company_id);
create index on public.loan_installments(employee_id);
create index on public.loan_installments(loan_id);
create index on public.loan_installments(due_year, due_month);
create index on public.loan_installments(status);

-- ── 3. Alter payroll_items to add loan_deduction ─────────────────────────────
alter table public.payroll_items add column loan_deduction bigint not null default 0 check (loan_deduction >= 0);

-- ── 4. Row Level Security (RLS) ──────────────────────────────────────────────
alter table public.employee_loans enable row level security;
alter table public.loan_installments enable row level security;

-- employee_loans Policies
create policy "employee_loans: select" on public.employee_loans
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

-- loan_installments Policies
create policy "loan_installments: select" on public.loan_installments
  for select using (
    public.user_role_in_company(company_id) in ('owner', 'admin', 'manager')
    or employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

-- Note: insert/update/delete operations are not allowed directly from clients and must go through RPC functions.

-- ── 5. Realtime Publication Settings ─────────────────────────────────────────
alter publication supabase_realtime add table public.employee_loans;
alter publication supabase_realtime add table public.loan_installments;

-- ── 6. Trigger to automatically keep next due date and status in sync ───────
create or replace function public.update_employee_loan_next_due()
returns trigger as $$
declare
  v_next_due_year int;
  v_next_due_month int;
  v_active_scheduled_count int;
  v_loan_id uuid;
begin
  v_loan_id := coalesce(new.loan_id, old.loan_id);

  -- Find the next scheduled installment (sequence ASC)
  select due_year, due_month
  into v_next_due_year, v_next_due_month
  from public.loan_installments
  where loan_id = v_loan_id and status = 'scheduled'
  order by sequence asc
  limit 1;

  -- Update employee_loans table next due year/month
  update public.employee_loans
  set next_due_year = v_next_due_year,
      next_due_month = v_next_due_month
  where id = v_loan_id;

  -- If status of installments is changing, check if there are any scheduled remaining
  -- If there were installments, and now there are 0 scheduled, and the loan is active,
  -- we transition the status of the loan to 'settled'!
  if TG_OP = 'UPDATE' or TG_OP = 'INSERT' then
    select count(*)
    into v_active_scheduled_count
    from public.loan_installments
    where loan_id = v_loan_id and status = 'scheduled';

    if v_active_scheduled_count = 0 and (select status from public.employee_loans where id = v_loan_id) = 'active' then
      update public.employee_loans
      set status = 'settled'
      where id = v_loan_id;
    end if;
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger tr_update_employee_loan_next_due
after insert or update or delete on public.loan_installments
for each row execute function public.update_employee_loan_next_due();

-- ── 7. SECURITY DEFINER RPC Functions ────────────────────────────────────────

-- request_loan
create or replace function public.request_loan(
  p_employee_id uuid,
  p_principal bigint,
  p_installments int,
  p_reason text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_installment_amount bigint;
  v_loan_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load employee details
  select company_id into v_company_id
  from public.employees
  where id = p_employee_id;

  if v_company_id is null then
    raise exception 'Employee not found';
  end if;

  -- Verify manager/admin authority
  if public.user_role_in_company(v_company_id) is null or public.user_role_in_company(v_company_id) not in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to request loan for this employee';
  end if;

  if p_principal <= 0 then
    raise exception 'Principal must be greater than 0';
  end if;

  if p_installments < 1 or p_installments > 60 then
    raise exception 'Installments must be between 1 and 60';
  end if;

  -- Compute installment amount (rounded, integer rupiah)
  v_installment_amount := round(p_principal::numeric / p_installments::numeric)::bigint;

  -- Insert employee_loans
  insert into public.employee_loans (
    company_id,
    employee_id,
    principal,
    installments,
    installment_amount,
    reason,
    status
  )
  values (
    v_company_id,
    p_employee_id,
    p_principal,
    p_installments,
    v_installment_amount,
    p_reason,
    'pending'
  )
  returning id into v_loan_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'request_loan',
    'employee_loans',
    v_loan_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'principal', p_principal,
      'installments', p_installments
    )
  );

  return v_loan_id;
end;
$$;

-- approve_loan
create or replace function public.approve_loan(
  p_loan_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_principal bigint;
  v_installments int;
  v_installment_amount bigint;
  v_status public.loan_status;
  v_start_year int;
  v_start_month int;
  v_due_year int;
  v_due_month int;
  i int;
  v_assigned_amount bigint;
  v_allocated_sum bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load loan details
  select company_id, employee_id, principal, installments, installment_amount, status
  into v_company_id, v_employee_id, v_principal, v_installments, v_installment_amount, v_status
  from public.employee_loans
  where id = p_loan_id;

  if v_company_id is null then
    raise exception 'Loan not found';
  end if;

  -- Verify manager/admin authority
  if public.user_role_in_company(v_company_id) is null or public.user_role_in_company(v_company_id) not in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to approve loan for this company';
  end if;

  if v_status != 'pending' then
    raise exception 'Only pending loans can be approved';
  end if;

  -- Update loan status to active
  update public.employee_loans
  set status = 'active',
      decided_by = auth.uid(),
      decided_at = now(),
      disbursed_at = now()
  where id = p_loan_id;

  -- Generate loan_installments schedule.
  -- Start from the current month of now() (in Asia/Jakarta)
  select extract(year from timezone('Asia/Jakarta', now()))::int,
         extract(month from timezone('Asia/Jakarta', now()))::int
  into v_start_year, v_start_month;

  v_allocated_sum := 0;

  for i in 1..v_installments loop
    -- Compute year/month increment
    v_due_month := v_start_month + (i - 1);
    v_due_year := v_start_year;
    
    while v_due_month > 12 loop
      v_due_month := v_due_month - 12;
      v_due_year := v_due_year + 1;
    end loop;

    -- Adjust the final installment to avoid rounding discrepancies
    if i = v_installments then
      v_assigned_amount := v_principal - v_allocated_sum;
    else
      v_assigned_amount := v_installment_amount;
    end if;

    insert into public.loan_installments (
      company_id,
      employee_id,
      loan_id,
      sequence,
      due_year,
      due_month,
      amount,
      status
    )
    values (
      v_company_id,
      v_employee_id,
      p_loan_id,
      i,
      v_due_year,
      v_due_month,
      v_assigned_amount,
      'scheduled'
    );

    v_allocated_sum := v_allocated_sum + v_assigned_amount;
  end loop;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'approve_loan',
    'employee_loans',
    p_loan_id,
    jsonb_build_object(
      'employee_id', v_employee_id,
      'principal', v_principal,
      'installments', v_installments
    )
  );
end;
$$;

-- reject_loan
create or replace function public.reject_loan(
  p_loan_id uuid,
  p_decision_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_principal bigint;
  v_status public.loan_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Load loan details
  select company_id, employee_id, principal, status
  into v_company_id, v_employee_id, v_principal, v_status
  from public.employee_loans
  where id = p_loan_id;

  if v_company_id is null then
    raise exception 'Loan not found';
  end if;

  -- Verify manager/admin authority
  if public.user_role_in_company(v_company_id) is null or public.user_role_in_company(v_company_id) not in ('owner', 'admin', 'manager') then
    raise exception 'Unauthorized to reject loan for this company';
  end if;

  if v_status != 'pending' then
    raise exception 'Only pending loans can be rejected';
  end if;

  -- Update loan status to rejected
  update public.employee_loans
  set status = 'rejected',
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = p_decision_note
  where id = p_loan_id;

  -- Write audit log
  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_company_id,
    auth.uid(),
    'reject_loan',
    'employee_loans',
    p_loan_id,
    jsonb_build_object(
      'employee_id', v_employee_id,
      'principal', v_principal,
      'decision_note', p_decision_note
    )
  );
end;
$$;
