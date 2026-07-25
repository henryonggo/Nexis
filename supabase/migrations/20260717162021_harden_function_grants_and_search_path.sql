-- Harden function grants + pin search_path (security-advisor hardening).
--
-- Recovered into version control to reconcile local ↔ remote migration
-- history: this version was applied to the remote project directly (Supabase
-- security-advisor fix) but was never committed, which broke the Supabase
-- GitHub check with "Remote migration versions not found in local migrations
-- directory". The body below is the exact statement set the remote recorded.
-- All blocks are idempotent (undefined_function is swallowed; ALTER … SET
-- search_path is repeatable), so re-applying on a fresh local reset is safe.

-- 1. Trigger/internal functions: never callable via RPC by any API role
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.enforce_free_seat_limit()',
    'public.enforce_payroll_run_gating()',
    'public.handle_new_user()',
    'public.on_attendance_change_for_overtime()',
    'public.on_employee_change()',
    'public.on_leave_request_submitted()',
    'public.process_webhook_events_trigger()',
    'public.update_employee_loan_next_due()',
    'public.validate_attendance_geofence()',
    'public.validate_attendance_liveness()'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

-- 2. Business RPCs requiring a signed-in user: revoke anon (keep authenticated)
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.accept_invitation(text)',
    'public.acknowledge_review(uuid)',
    'public.approve_claim(uuid, text)',
    'public.approve_join_request(uuid, public.company_role)',
    'public.approve_leave(uuid)',
    'public.approve_loan(uuid)',
    'public.calculate_overtime_hours(uuid, date)',
    'public.create_company_with_owner(text, text)',
    'public.deactivate_current_user()',
    'public.generate_api_key(uuid, text, text[], timestamptz)',
    'public.generate_overtime_entries(uuid, date)',
    'public.generate_scim_token(uuid, timestamptz)',
    'public.get_payroll_readiness(uuid)',
    'public.get_scim_user_by_id(uuid, uuid)',
    'public.get_scim_users(uuid, text)',
    'public.get_user_id_by_email(text)',
    'public.hire_application(uuid)',
    'public.is_current_user_active()',
    'public.link_employee_account(uuid, uuid)',
    'public.mark_payroll_items_paid(uuid[], text)',
    'public.recompute_employee_overtime(uuid, date)',
    'public.record_attendance(uuid, public.attendance_kind, double precision, double precision, text, text)',
    'public.refresh_active_seats(uuid)',
    'public.reject_claim(uuid, text)',
    'public.reject_join_request(uuid, text)',
    'public.reject_leave(uuid, text)',
    'public.reject_loan(uuid, text)',
    'public.request_company_join(text)',
    'public.request_loan(uuid, bigint, integer, text)',
    'public.rotate_company_join_code(uuid)',
    'public.scim_set_user_active(uuid, uuid, boolean)',
    'public.seed_indonesian_holidays(integer)',
    'public.set_run_manual_days(uuid, uuid, integer)',
    'public.submit_review(uuid)',
    'public.update_own_contact(text, text, text, text)',
    'public.user_can_manage_employee(uuid)',
    'public.user_has_company_access(uuid)',
    'public.user_is_company_admin(uuid)',
    'public.user_is_company_manager_or_admin(uuid)',
    'public.user_role_in_company(uuid)',
    'public.users_share_company(uuid, uuid)'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

-- NOTE: public.get_invite_email(text) intentionally left callable by anon
-- (pre-signup invitation flow may depend on it; confirm in app code before revoking)

-- 3. Pin search_path on flagged functions
ALTER FUNCTION public.generate_random_join_code() SET search_path = public;
ALTER FUNCTION public.generate_unique_join_code() SET search_path = public;
ALTER FUNCTION public.validate_attendance_liveness() SET search_path = public;
ALTER FUNCTION public.safe_cast_uuid(text) SET search_path = public;
