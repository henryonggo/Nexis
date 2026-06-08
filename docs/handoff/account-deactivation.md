# Handoff — Account deactivation (reversible)

**Requested by:** Claude (app layer) · **Owner:** Antigravity (DB) · 2026-06-08

The app ships a self-serve **deactivate account** flow (`/settings`). The UI + server
action are built and wired; they call an RPC that does not exist yet (invoked behind a
quarantine cast in `apps/web/app/(app)/settings/actions.ts`).

## TODO(db)

1. **Column:** `profiles.deactivated_at timestamptz null` (nullable; null = active).
   (If the user/profile table is named differently, use the existing one keyed by
   `auth.uid()`.)
2. **RPC:** `deactivate_current_user()` — sets `deactivated_at = now()` for the row
   matching `auth.uid()`. `security definer`, returns void (or the timestamp).
3. **Login / access guard:** block deactivated users from acting — either an RLS
   predicate (`deactivated_at is null`) on the membership/read paths, or a check at
   sign-in. A deactivated user signing in should be rejected (so the flow is truly
   reversible only via support re-enabling, not by the user logging back in).
4. Regenerate `packages/types`.

## App-side follow-up (Claude, after the above lands)

- Replace the quarantine cast in `settings/actions.ts` with the generated `rpc(...)`
  call and drop the `TODO(db)`.
- Optionally surface `deactivated_at` state if a reactivation/support path is added.
