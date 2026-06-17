# Handoff — Leave-request push notifications (P1-6) — 🟡 DB + INFRA OPEN

**Requested by:** Claude (app layer) · **Owner:** Antigravity (DB trigger + Edge) / Claude (mobile token registration) · 2026-06-17

> **Status:** spec only. Nothing landed yet. This is the `TODO(db)`/`TODO(infra)` tracking
> item per `docs/08-agent-boundaries.md`. Functional delivery is cross-seam — it cannot be
> shipped from the app layer alone, so no inert pipeline was committed. Plan below.

## Goal

When an employee submits a leave request, push a notification to every manager/admin/owner
in that company so they approve without having to open the app. Mirrors the existing
notification stack (`supabase/functions/send-notification` already does Expo push + email).

## Why it can't be pure app-layer

- Leave requests are inserted **client-side from mobile** (`apps/mobile/lib/leave.ts` →
  `submitLeaveRequest` → `insert into leave_requests`). There is no web/server action to hook,
  so the reliable fan-out trigger is a **DB trigger**, not app code.
- Push delivery needs each recipient's **Expo push token**, which must be stored server-side.
  No table exists for that today.

## TODO(db) — Antigravity

1. ✅ **Token table already exists:** `public.expo_push_tokens (id uuid, user_id uuid, token
   text, created_at timestamptz)`, RLS enabled. Reuse it — do **not** create a new
   `push_tokens` table. (No `platform` column; add one only if per-platform routing is needed.)
2. **Trigger** on `leave_requests` `AFTER INSERT`: resolve the company's
   manager/admin/owner `user_id`s (via `company_members`), and invoke `send-notification`
   (pg_net / supabase function call) with `{ event: 'leave_submitted', companyId, leaveRequestId,
   recipientUserIds }`. Keep the resolve logic in SQL/RPC so the app never fans out manually.
   *(Verified 2026-06-17: no trigger on `leave_requests` and no push/notify function yet.)*

## TODO(infra) — `send-notification` extension

Add a `leave_submitted` event: look up `push_tokens` for `recipientUserIds`, POST to the
**Expo push API** (`https://exp.host/--/api/v2/push/send`), batch ≤100 messages. Title/body in
Bahasa (e.g. "Pengajuan cuti baru" / "{employee} mengajukan cuti {dates}"). Reuse the function's
existing logging + email fallback. Secrets via function env, never in repo.

## App-side follow-up — Claude (after the table lands)

Mobile only; lives on `feat/mobile-employee-dashboard` (where the employee app shell is):
- Add `expo-notifications`; on app start request permission and get the Expo push token.
- Upsert it into the existing `expo_push_tokens` (`user_id`, `token`) on login / token change;
  delete on sign-out. `expo_push_tokens` has 0 rows today — nothing registers tokens yet.
- No web app work — the trigger + edge function do the fan-out.

## Acceptance

Employee submits leave from mobile → each manager/admin/owner with a registered device gets a
push within seconds → tapping it opens the leave approval queue. Users without a token (or who
denied permission) are silently skipped; email still sends.
