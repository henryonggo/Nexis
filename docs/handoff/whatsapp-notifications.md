# Handoff — WhatsApp notifications — 🟡 PROPOSED

**Requested by:** Claude (app layer) · **Owner:** Antigravity (DB + Edge) / human (Meta acct) · 2026-06-09

Adds WhatsApp as a third notification channel alongside the existing Expo push + email
(`supabase/functions/send-notification`). The app-layer opt-in UI is built; it writes one
column that doesn't exist yet.

## App side (done — Claude)

`/settings` → **Notifications** section ([notifications-form.tsx](../../apps/web/app/(app)/settings/notifications-form.tsx)):
- Captures the user's WhatsApp **phone** → `profiles.phone` (real column, persists today).
- **Opt-in** checkbox → `profiles.whatsapp_opt_in` (pending — see TODO(db) below). Written
  behind a quarantine cast in [settings/actions.ts](../../apps/web/app/(app)/settings/actions.ts)
  (`updateNotifications`). Validates phone (8–15 digits) and requires a number when opting in.

## TODO(db) — Antigravity

1. **Column:** `profiles.whatsapp_opt_in boolean not null default false`.
2. **RLS:** allow a user to **update their own** `profiles` row for `phone` + `whatsapp_opt_in`
   (`id = auth.uid()`). The settings action does a direct `update` (no RPC).
3. Regenerate `packages/types`.

## TODO(infra) — `send-notification` WhatsApp channel

Extend `supabase/functions/send-notification` so that, for each recipient with
`whatsapp_opt_in = true` and a non-empty `profiles.phone`, it also sends via the **Meta
WhatsApp Cloud API** (template message) — in addition to push/email.

- Normalize `phone` to E.164 (ID numbers: `08…` → `+628…`). Reject/skip invalid.
- Secrets (Meta `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, template names) via Secret
  Manager / function env — never in the repo.
- Use pre-approved **message templates** (WA requires templates for business-initiated
  messages): e.g. leave-approved, claim-approved, payslip-ready. Map each existing
  notification event to a template + variables.
- Respect opt-in: no opt-in or no phone → silently skip the WA leg (push/email still send).
- Log delivery + failures (reuse the function's existing logging).

## App-side follow-up (Claude, after the column lands)

- Change the prefs read in [settings/page.tsx](../../apps/web/app/(app)/settings/page.tsx)
  from `select("phone")` to `select("phone, whatsapp_opt_in")` and drop the quarantine cast
  in `settings/actions.ts` (use the generated type).
- Optional: surface per-event toggles if product wants granular control (currently a single
  global WhatsApp opt-in).
