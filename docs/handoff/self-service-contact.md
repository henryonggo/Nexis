# Handoff — Self-service contact & bank edit — 🟡 DB OPEN (RPC)

**Requested by:** Claude (app layer) · **Owner:** Antigravity (RPC) · 2026-06-17

> Lets any role edit **their own** contact phone + primary bank account from `/profile`.
> Owner/admin editing **other** employees already works via the existing
> `employees`/`bank_accounts` "admin write" policies (no DB change needed there). This
> handoff is only the self-service column-scoped RPC.

## App side (done — Claude)

- New + edit employee forms now capture `phone` + bank (`bank_name`, `account_no`,
  `account_name`) → `employees.phone` + primary `bank_accounts`. Owner/admin only; works
  today under `user_is_company_admin` write policies.
- `/profile` shows an editable **Contact & Bank** form for the signed-in user's own
  employee record ([personal-info-form.tsx](../../apps/web/app/(app)/profile/personal-info-form.tsx)),
  submitting to `updateOwnContact` ([profile/actions.ts](../../apps/web/app/(app)/profile/actions.ts))
  which calls `rpc('update_own_contact', …)` behind a quarantine cast.

## Why an RPC (not an RLS policy)

`employees` and `bank_accounts` only have an admin write policy + self **read**. A self
**update** policy would let a non-admin change *any* column of their `employees` row
(name, status, …). The requirement is that self may change **only** phone + bank, so the
write must be column-scoped — cleanest via a `SECURITY DEFINER` RPC. (Mirrors the existing
`deactivate_current_user` / `link_employee_account` RPC pattern.)

## TODO(db) — Antigravity

```sql
create or replace function update_own_contact(
  p_phone text, p_bank_name text, p_account_no text, p_account_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp employees;
begin
  select * into v_emp from employees where user_id = auth.uid() limit 1;
  if v_emp.id is null then raise exception 'NO_EMPLOYEE_RECORD'; end if;

  update employees set phone = nullif(p_phone,''), updated_at = now() where id = v_emp.id;

  if coalesce(p_bank_name,'')<>'' or coalesce(p_account_no,'')<>'' or coalesce(p_account_name,'')<>'' then
    -- upsert the caller's primary bank account
    if exists (select 1 from bank_accounts where employee_id = v_emp.id and is_primary) then
      update bank_accounts set bank_name=nullif(p_bank_name,''), account_no=nullif(p_account_no,''),
        account_name=nullif(p_account_name,'') where employee_id=v_emp.id and is_primary;
    else
      insert into bank_accounts(company_id, employee_id, bank_name, account_no, account_name, is_primary)
      values (v_emp.company_id, v_emp.id, nullif(p_bank_name,''), nullif(p_account_no,''), nullif(p_account_name,''), true);
    end if;
  end if;
end $$;

grant execute on function update_own_contact(text,text,text,text) to authenticated;
```

Then regenerate `packages/types`; Claude drops the cast in `profile/actions.ts`.

## Acceptance

Employee/manager opens `/profile` → edits phone + bank → saves → values persist and
re-render. They cannot change any other field. Owner/admin can edit the same fields for any
employee from `/employees/[id]` and set them at creation in `/employees/new`.
