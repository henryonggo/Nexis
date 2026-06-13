# Case 02 — Attendance Go-Live → First Payroll Run

> **Type:** end-to-end user workflow case, audited against the codebase on 2026-06-12.
> **Covers:** playbook stages W4–W5 (`docs/09-client-workflow-playbook.md`) — the
> activation path. Gap numbering continues from case-01 (G1–G4) for global uniqueness.
> **Status legend:** ✅ implemented & verified in code · ⚠️ implemented with caveats · ❌ gap.

**Actors:** Admin (Budi), Employee (Sari, linked per case-01 G1).
**Preconditions:** case-01 complete — company on free tier, ≤5 employees with
compensation + tax profile, Sari's account linked.

---

## Verdict up front

The two endpoints of this workflow are strong: mobile clock-in with GPS/selfie and
DB-side geofence validation work (W4), and the payroll engine is the best-tested
code in the repo — TER (PMK 168/2023), BPJS caps, 1/173 overtime, no-NPWP +20%,
THR proration, December reconciliation, all against hand-verified fixtures (W5).

The problem is the **seam between them**: overtime is computed nowhere. The
`overtime_entries` table exists and the payroll worker faithfully consumes
*approved* entries — but no trigger, job, or UI ever writes one (G5). And attendance
configuration (geofences, shifts, schedules, holidays) has **no admin UI at all**
(G6), so W4's entry criteria can't be met through the product — only via SQL.

---

## Step-by-step trace

### C7 — Attendance configuration (W4 entry criteria)

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 19 | Admin defines office geofence(s) | UI to create geofence (lat/lng/radius) | `geofences` table + RLS exist (stage-3 migration); **no web UI, no seed** | ❌ G6 |
| 20 | Admin defines shifts & work schedules | Shift times, schedule assignment per employee | `shifts`, `work_schedules` tables exist; **no web UI** | ❌ G6 |
| 21 | Holiday calendar present for the year | Indonesian national holidays seeded; affect overtime classification | `holidays` table + `calculate_overtime_hours` honors it; **table never populated** | ❌ G6 |

### C8 — Daily attendance (employee, mobile)

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 22 | Sari opens Attendance, clocks in | GPS captured, selfie captured, record stored | `apps/mobile/app/(app)/attendance.tsx` (expo-location + expo-camera, auto-capture) | ✅ |
| 23 | Liveness check on selfie | Anti-spoof verification | **Timer-based mock** ("Menyelaraskan wajah…" phases) — no real liveness | ⚠️ G8 |
| 24 | Clock-in outside geofence | Record flagged `is_valid=false` | DB trigger `validate_attendance_geofence` (Haversine) — server-side, can't be bypassed by the client | ✅ |
| 25 | Break start/end, clock out | All four `kind`s supported | `record_attendance` RPC + mobile UI | ✅ |
| 26 | Sari sees only her own records | RLS self-scoped | stage-3 policies via `employees.user_id` (live since G1) | ✅ |

### C9 — Attendance oversight (admin, web)

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 27 | Record appears live on web board | Realtime push, no refresh | `live-board.tsx` Realtime subscription ("Menyambung…" → "Langsung") | ✅ |
| 28 | Admin corrects/invalidates a record | Audited change, role-gated | `attendance/actions.ts` `correctRecord` + audit-log DB trigger; `canCorrect = role !== "employee"` | ✅ |
| 29 | Overtime detected from clock data | Hours beyond schedule → structured entries | DB trigger `trg_attendance_overtime` calls `recompute_employee_overtime` | ✅ |
| 30 | Manager approves overtime | Approval flow before payroll consumes it | `overtime_entries` RLS + check constraints implemented; **no UI** | ⚠️ G5 |

### C10 — First payroll run (admin, web)

| # | Action | Expected | Implementation | Status |
|---|---|---|---|---|
| 31 | Admin opens `/payroll/new` | Role-gated; period + run type (monthly / THR) | page guard + `new/form.tsx` | ✅ |
| 32 | Pre-run validation | Blocking-issue list (missing bank/tax) before draft | **None** — draft proceeds with defaults (`TK/0` fallback) | ❌ G7 ★ |
| 33 | Draft created with config snapshot | `payroll_runs.config_snapshot` persisted for reproducibility | `createDraftRun` in `payroll/actions.ts` | ✅ |
| 34 | Engine computes correctly | TER category (PMK 168/2023), BPJS both sides + caps, 1/173 overtime base, no-NPWP ×1.20, THR proration, Dec reconciliation | `packages/payroll` — pure TS, 34 tests incl. hand-verified rupiah-exact fixtures | ✅ |
| 35 | Run processed async with live status | queued → processing → completed, Realtime | `enqueuePayrollRun` → worker `/process`; `status-stream.tsx` | ⚠️ direct HTTP fetch, `TODO(infra)` Cloud Tasks queue — fine for v1, no retry semantics |
| 36 | Overtime included in pay | From approved `overtime_entries` | Worker reads them ✅, DB writes them upon clock-out ✅, web UI pending | ⚠️ G5 |
| 37 | Review → approve → mark paid | Status transitions role-gated; cancel from draft/queued/failed | `approveRun`, `markRunPaid`, `cancelRun` + `actions-bar.tsx` state machine | ✅ |
| 38 | Payslip PDFs generated | Per-employee PDF in private storage | worker generates + uploads, `payslips` rows | ✅ |
| 39 | Sari downloads her payslip (mobile) | Signed URL, own payslips only | `payslips.tsx` + stage-4 RLS | ✅ |
| 40 | Admin downloads payslips (web run page) | Per-employee PDF links on `/payroll/[runId]` | **Not exposed on web** — mobile only | ⚠️ G9 |
| 41 | Re-run after a rate change | Historical run unchanged (snapshot) | worker computes from `config_snapshot`, not live config | ✅ |
| 42 | Tax-affecting gating | Full automation requires paid plan / NPWP (roadmap rule) | `plan` stored on the run but **not enforced** | ⚠️ G9 |
| 43 | e2e coverage | Guard + happy path | `e2e/payroll.spec.ts` (guards, draft→approve), `attendance.spec.ts` (live board) | ✅ |

---

## Gaps & recommended fixes

### G5 — ❌ Overtime pipeline is broken in the middle (blocker for "compliant payroll")

The plumbing exists at both ends: `calculate_overtime_hours()` (correct: schedule
lookup, 1h break deduction, rest-day/holiday classification) and the worker's
consumption of approved entries. Missing middle:

```
TODO(db): a writer for overtime_entries — either a trigger on clock_out or a
nightly job that calls calculate_overtime_hours() and upserts entries
(is_approved=false). pgTAP: weekday vs holiday classification, no duplicates
on re-run. — Antigravity
```

App lane (after migration): overtime approval queue UI (likely on `/attendance`),
and delete the `overtimePay: 0` TODO in `lib/payroll.ts` by wiring approved hours
into the estimator. **Recommend the same handoff-doc pattern as G1**
(`docs/handoff/overtime-pipeline.md`).

### G6 — ❌ No admin UI for attendance configuration (W4 cannot start from the product)

`geofences`, `shifts`, `work_schedules`, `holidays` are SQL-only. Without them:
every mobile clock-in is geofence-unvalidated or fails, overtime classification has
no schedule to compare against, and holidays never apply. Fix (mostly Claude lane):
a Settings → Attendance section with geofence CRUD (map picker optional, lat/lng
fields fine for v1), shift/schedule CRUD + employee assignment, and a one-click
"seed Indonesian holidays {year}" (the seed data itself is Antigravity's lane).

### G7 — ❌ Pre-run validation gate (already ★ in the playbook backlog)

`createDraftRun` silently falls back (e.g. missing tax profile → `TK/0`), which can
produce a *wrong-but-plausible* payroll. A readiness check listing per-employee
blocking issues (no bank account, no tax profile, no compensation) before the draft
button activates. Needs a small DB readiness view/RPC (Antigravity) + gate UI (Claude).

### G8 — ⚠️ Selfie liveness is a timed mock

The mobile flow *looks* like liveness (face-align phases, auto-capture) but is
timer-based — no anti-spoof. Acceptable for v1 if documented; real liveness is a
Stage 7 decision (on-device ML vs vendor). Don't market it as liveness until then.

### G9 — ⚠️ Three smaller items

(a) Web admins can't download payslip PDFs from `/payroll/[runId]` — mobile-only
today; add signed-URL links per row. (b) Run enqueue is a direct HTTP fetch with a
`TODO(infra)` for Cloud Tasks — no retries if the worker is down (Antigravity,
deferred OK). (c) Paid-plan/NPWP gating for tax-affecting runs is recorded but not
enforced — decision needed: enforce at Stage 6 billing, or now.

---

## Recommended sequencing

1. **G6 config UI + G5 DB writer in parallel** (different lanes, zero file overlap)
   — together they make W4 actually achievable in-product.
2. **G5 approval UI + estimator wiring** once the writer lands (same pattern as G1).
3. **G7 validation gate** (★ backlog) — small, high trust value.
4. G9(a) payslip links — quick win; G8/G9(b,c) — schedule consciously, not urgent.

## Re-test checklist (after fixes)

- [ ] Admin creates geofence + schedule + seeds holidays entirely from the UI.
- [ ] Sari clocks in inside geofence (valid) and outside (flagged); both visible live on web.
- [ ] Overtime beyond schedule appears as a pending entry; manager approves it.
- [ ] Pre-run gate blocks a run while an employee lacks a bank account; passes after fix.
- [ ] Monthly run: gross/BPJS/PPh 21/net match `packages/payroll` fixtures to the rupiah; overtime included.
- [ ] Payslip PDF downloadable from web run page *and* Sari's mobile app.
- [ ] Rate change + re-run → historical run byte-identical (snapshot).
