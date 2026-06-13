# Handoff — Selfie liveness / anti-spoof (G8) — 🟡 OPEN (Antigravity + product)

> **Owner:** Antigravity (infra/verification) + product (vendor vs on-device decision) →
> Claude/mobile (capture flow). Post-beta. Source:
> `docs/cases/case-02-attendance-to-first-payroll.md` G8; `docs/10` ("production liveness = post-beta").

## Problem

The mobile clock-in *looks* like a liveness check (face-align phases, auto-capture in
`apps/mobile/app/(app)/attendance.tsx`) but is a **timer-based mock** — no anti-spoof. A photo
of a photo passes. Combined with the server-side geofence this is acceptable for beta, but
"titip absen" via a still image is still possible. Must not be marketed as liveness until real.

## Decision needed first (product + Antigravity)

Pick the verification approach — drives everything else:
- **On-device ML** (e.g. an MLKit/TFLite face-liveness model in the Expo app) — no PII leaves
  the phone, but model + app work, weaker than server checks.
- **Vendor API** (a liveness/face-match SaaS) — stronger, but adds cost, a secret, and sends a
  selfie off-device → privacy + consent considerations.

## TODO (Antigravity, after the decision)

1. If vendor: an **Edge function** `verify-liveness(attendance_id, image)` holding the vendor
   secret (mirror `send-notification`), returning pass/fail + score; never embed the key in the
   app. If on-device: ship the model + a signed attestation the server can trust.
2. Persist the result: extend `attendance_records` (or a sibling table) with
   `liveness_passed boolean`, `liveness_score numeric`, `liveness_method text`. `TODO(db)` +
   regenerate types.
3. Policy: a failed liveness flags the record (`is_valid = false`) like an out-of-geofence
   punch — flag, don't hard-block (same UX rule as the geofence).

## App follow-up — Claude / mobile

- Replace the timed mock in the mobile capture flow with the real check; surface a retry on
  failure. Show the liveness flag on the web live board next to the geofence flag. i18n.

## Acceptance

- A still photo held to the camera is flagged (not accepted as live); a real face passes.
- The selfie path no longer claims "liveness" unless the real check ran.
