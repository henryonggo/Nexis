# Handoff — Selfie liveness / anti-spoof (G8) — 🟢 DB DONE / 🟡 INFRA OPEN

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
2. ✅ **DB Done**: Extended `attendance_records` with `liveness_passed boolean`, `liveness_score numeric`, `liveness_method text` columns.
3. ⏳ **Policy trigger — Antigravity, planned, NOT yet landed** (capacity-limited): a
   `BEFORE INSERT OR UPDATE OF liveness_passed` trigger setting `is_valid = false` + appending
   `[Failed liveness check]` to `note` when `liveness_passed = false` (flag, don't hard-block, like
   the geofence). Migration `20260615100700_attendance_liveness_policy.sql` + pgTAP. **Until this
   lands, nothing flips `is_valid` on a liveness fail — the web badge below only lights up once the
   trigger (and a real check that writes `liveness_passed = false`) exist.**

## App follow-up — Claude / mobile

- ✅ **Web live board (Claude, done):** the validity column now distinguishes the reason — a
  record invalid with `liveness_passed = false` shows **"Face check failed"**, otherwise
  "Out of area". Reads `attendance_records.liveness_passed`; aligns with the planned trigger.
  i18n id-ID + en. (`live-board.tsx`, `attendance/page.tsx`.)
- ⏳ **Mobile (blocked):** replace the timed mock with the real check + retry on failure. Needs the
  vendor-vs-on-device decision and the `verify-liveness` path first.

## Acceptance

- A still photo held to the camera is flagged (not accepted as live); a real face passes.
- The selfie path no longer claims "liveness" unless the real check ran.
