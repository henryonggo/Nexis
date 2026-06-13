-- Migration: Holiday Seeding RPC (Case-02 G6)
-- Implement seed_indonesian_holidays(p_year integer)

create or replace function public.seed_indonesian_holidays(
  p_year integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dates date[];
  v_names text[];
  i integer;
begin
  if p_year = 2024 then
    v_dates := array[
      '2024-01-01'::date,
      '2024-02-08'::date,
      '2024-02-10'::date,
      '2024-03-11'::date,
      '2024-03-29'::date,
      '2024-03-31'::date,
      '2024-04-10'::date,
      '2024-04-11'::date,
      '2024-05-01'::date,
      '2024-05-09'::date,
      '2024-05-23'::date,
      '2024-06-01'::date,
      '2024-06-17'::date,
      '2024-07-07'::date,
      '2024-08-17'::date,
      '2024-09-15'::date,
      '2024-12-25'::date
    ];
    v_names := array[
      'New Year',
      'Isra Mi''raj',
      'Chinese New Year',
      'Day of Silence (Nyepi)',
      'Good Friday',
      'Easter Day',
      'Eid Al-Fitr Day 1',
      'Eid Al-Fitr Day 2',
      'International Labor Day',
      'Ascension of Jesus Christ',
      'Vesak Day',
      'Pancasila Day',
      'Eid al-Adha',
      'Islamic New Year',
      'Independence Day',
      'Birthday of Prophet Muhammad',
      'Christmas Day'
    ];
  elsif p_year = 2025 then
    v_dates := array[
      '2025-01-01'::date,
      '2025-01-27'::date,
      '2025-01-29'::date,
      '2025-03-29'::date,
      '2025-03-31'::date,
      '2025-04-01'::date,
      '2025-04-18'::date,
      '2025-04-20'::date,
      '2025-05-01'::date,
      '2025-05-12'::date,
      '2025-05-29'::date,
      '2025-06-01'::date,
      '2025-06-06'::date,
      '2025-06-27'::date,
      '2025-08-17'::date,
      '2025-09-05'::date,
      '2025-12-25'::date
    ];
    v_names := array[
      'New Year',
      'Isra Mi''raj',
      'Chinese New Year',
      'Day of Silence (Nyepi)',
      'Eid al-Fitr Day 1',
      'Eid al-Fitr Day 2',
      'Good Friday',
      'Easter Day',
      'International Labor Day',
      'Vesak Day',
      'Ascension of Jesus Christ',
      'Pancasila Day',
      'Eid al-Adha',
      'Islamic New Year',
      'Independence Day',
      'Birthday of Prophet Muhammad',
      'Christmas Day'
    ];
  elsif p_year = 2026 then
    v_dates := array[
      '2026-01-01'::date,
      '2026-01-16'::date,
      '2026-02-17'::date,
      '2026-03-19'::date,
      '2026-03-21'::date,
      '2026-03-22'::date,
      '2026-04-03'::date,
      '2026-04-05'::date,
      '2026-05-01'::date,
      '2026-05-14'::date,
      '2026-05-27'::date,
      '2026-05-31'::date,
      '2026-06-01'::date,
      '2026-06-16'::date,
      '2026-08-17'::date,
      '2026-08-25'::date,
      '2026-12-25'::date
    ];
    v_names := array[
      'New Year',
      'Isra Mi''raj',
      'Chinese New Year',
      'Day of Silence (Nyepi)',
      'Eid al-Fitr Day 1',
      'Eid al-Fitr Day 2',
      'Good Friday',
      'Easter Day',
      'International Labor Day',
      'Ascension of Jesus Christ',
      'Eid al-Adha',
      'Vesak Day',
      'Pancasila Day',
      'Islamic New Year',
      'Independence Day',
      'Birthday of Prophet Muhammad',
      'Christmas Day'
    ];
  else
    -- Fallback default fixed-date national holidays
    v_dates := array[
      (p_year || '-01-01')::date,
      (p_year || '-05-01')::date,
      (p_year || '-06-01')::date,
      (p_year || '-08-17')::date,
      (p_year || '-12-25')::date
    ];
    v_names := array[
      'New Year',
      'International Labor Day',
      'Pancasila Day',
      'Independence Day',
      'Christmas Day'
    ];
  end if;

  for i in 1..array_length(v_dates, 1) loop
    insert into public.holidays (date, name, is_national)
    values (v_dates[i], v_names[i], true)
    on conflict (date) do update set
      name = excluded.name;
  end loop;
end; $$;

-- Revoke execute from public and anon (which are granted by default in Supabase/Postgres)
revoke execute on function public.seed_indonesian_holidays(integer) from public, anon;

-- Grant execution to authenticated users
grant execute on function public.seed_indonesian_holidays(integer) to authenticated;
