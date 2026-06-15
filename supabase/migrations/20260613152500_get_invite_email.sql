-- ============================================================================
-- Nexis — Securely get email from pending invitation token
-- ============================================================================

create or replace function public.get_invite_email(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select email into v_email from public.invitations
  where token = p_token and status = 'pending';
  return v_email;
end; $$;

-- Revoke default privileges and grant specifically to anon and authenticated
revoke execute on function public.get_invite_email(text) from public;
grant execute on function public.get_invite_email(text) to anon, authenticated;
