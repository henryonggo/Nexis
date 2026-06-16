-- Nexis — Fix invited member RLS name visibility and member management actions

alter table public.profiles add column email text;

-- Update the handle_new_user trigger function to populate email
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end; $$;

-- Backfill existing profiles
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Add a helper to check if two users share any company membership
create or replace function public.users_share_company(user_a uuid, user_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members cm1
    join public.company_members cm2 on cm1.company_id = cm2.company_id
    where cm1.user_id = user_a and cm2.user_id = user_b
  );
$$;

-- Add profiles RLS policy for selecting co-workers' profiles
create policy "profiles: company members read" on public.profiles
  for select using (
    public.is_current_user_active()
    and public.users_share_company(auth.uid(), id)
  );
