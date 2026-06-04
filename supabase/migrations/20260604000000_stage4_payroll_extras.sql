-- ============================================================================
-- Nexis — Stage 4 Additions: minimum_wages, company region, and selfies storage
-- ============================================================================

-- ── 1. Minimum Wages Reference Table (Global, versioned, read-only to auth) ──
create table minimum_wages (
  id             uuid primary key default gen_random_uuid(),
  region         text not null,            -- e.g., 'DKI Jakarta', 'Jawa Barat'
  amount         bigint not null check (amount >= 0),
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_from <= effective_to)
);
create index on minimum_wages(region, effective_from);

alter table minimum_wages enable row level security;

create policy "minimum_wages: select" on minimum_wages
  for select using (auth.role() = 'authenticated');

-- ── 2. Company Region ────────────────────────────────────────────────────────
alter table company_settings add column region text not null default 'DKI Jakarta';

-- ── 3. Attendance Selfies Storage Bucket Configuration ───────────────────────
insert into storage.buckets (id, name, public)
values ('attendance-selfies', 'attendance-selfies', false)
on conflict (id) do nothing;

create policy "attendance-selfies: select" on storage.objects
  for select using (
    bucket_id = 'attendance-selfies'
    and (
      auth.uid() = owner
      or public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
    )
  );

create policy "attendance-selfies: insert" on storage.objects
  for insert with check (
    bucket_id = 'attendance-selfies'
    and auth.uid() = owner
    and public.user_has_company_access(cast(split_part(name, '/', 1) as uuid))
    and exists (
      select 1 from public.employees
      where id = cast(split_part(name, '/', 2) as uuid)
        and user_id = auth.uid()
    )
  );

create policy "attendance-selfies: admin write" on storage.objects
  for all using (
    bucket_id = 'attendance-selfies'
    and public.user_is_company_admin(cast(split_part(name, '/', 1) as uuid))
  );
