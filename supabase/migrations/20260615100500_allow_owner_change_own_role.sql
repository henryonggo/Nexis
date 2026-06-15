-- Nexis — Allow owners and admins to change their own roles
drop policy if exists "members: admin write" on public.company_members;

create policy "members: admin insert" on public.company_members
  for insert with check (public.user_is_company_admin(company_id));

create policy "members: admin update" on public.company_members
  for update
  using (public.user_is_company_admin(company_id))
  with check (
    public.user_is_company_admin(company_id)
    or user_id = auth.uid()
  );

create policy "members: admin delete" on public.company_members
  for delete using (public.user_is_company_admin(company_id));
