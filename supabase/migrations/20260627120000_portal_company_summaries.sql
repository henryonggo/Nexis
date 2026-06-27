-- Cross-company portal summaries (P2-8, multi-company accountant portal).
--
-- Returns one row per company the caller belongs to, carrying the at-a-glance
-- aggregates the /portal cards render. SECURITY INVOKER on purpose: the caller's
-- RLS scopes BOTH the company set (companies: members read) and every underlying
-- aggregate — a member who can't read a company's billing or leave gets nulls /
-- zeros, never another tenant's data. This collapses the app's per-company
-- fan-out (N companies x ~4 reads) into a single round trip.
create or replace function public.portal_company_summaries()
returns table (
  company_id uuid,
  name text,
  role company_role,
  plan plan_tier,
  headcount integer,
  active_seats smallint,
  free_seat_limit smallint,
  last_run_period_year smallint,
  last_run_period_month smallint,
  last_run_status pay_period_status,
  last_run_total_net bigint,
  pending_approvals integer
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    c.id,
    c.name,
    m.role,
    c.plan,
    (select count(*) from employees e
       where e.company_id = c.id and e.status = 'active')::integer,
    cb.active_seats,
    cb.free_seat_limit,
    lr.period_year,
    lr.period_month,
    lr.status,
    lr.total_net,
    (select count(*) from leave_requests l
       where l.company_id = c.id and l.status = 'pending')::integer
  from companies c
  join company_members m on m.company_id = c.id and m.user_id = auth.uid()
  left join company_billing cb on cb.company_id = c.id
  left join lateral (
    select pr.period_year, pr.period_month, pr.status, pr.total_net
    from payroll_runs pr
    where pr.company_id = c.id
    order by pr.period_year desc, pr.period_month desc
    limit 1
  ) lr on true
  order by c.name;
$$;

grant execute on function public.portal_company_summaries() to authenticated;
