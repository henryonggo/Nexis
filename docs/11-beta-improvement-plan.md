# 11 — Beta Improvement Plan

> **Purpose:** prioritized action list to take Nexis from current state to a beta
> you can put in front of real Indonesian HR teams. Every item is tied to a specific
> pain point and a specific gap in the audit docs.
>
> **Priority tiers:**
> - **P0 — Beta blocker.** Cannot ship beta without this. A user hits a dead end or
>   gets a wrong result.
> - **P1 — Beta polish.** Beta works without it, but the experience is rough. Ship
>   within the first beta sprint.
> - **P2 — Post-beta.** Real value, but not what makes or breaks activation.
>
> **Owners:**
> - 🔵 **Claude** — app layer (`apps/web`, `apps/mobile`, `packages/*`, e2e, i18n)
> - 🟠 **Antigravity** — DB layer (`supabase/migrations`, RPC, pgTAP, `packages/types` regen)
> - 🟡 **Both** — Claude writes the UI against a TODO(db) stub; Antigravity lands the DB;
>   Claude removes the stub.
>
> **Reference docs:**
> - Beta scope & pain points: `docs/10-beta-workflow-painpoints.md`
> - Case audits: `docs/cases/case-01-*`, `docs/cases/case-02-*`
> - Handoff specs: `docs/handoff/*`

---

## P0 — Beta blockers (must fix before any user sees this)

### P0-0 · Employee Single-Page Dashboard (Mobile) ⚡ MOST URGENT
**Gap:** `apps/mobile/app/(app)/index.tsx` is a dev placeholder. Employee opens the
app after accepting an invite and sees a text note about "Stage 3–5." First impression
is broken.

**Decision:** The employee mobile experience collapses to **one page**. No tabs for
attendance, leave, claims, payslips as separate destinations. Everything the employee
needs is on one scrollable dashboard. The only other reachable page is their profile.

**Pain point solved:** Employees currently receive a payslip they don't understand and
have no way to check their own records without going through HR. This page gives them
everything they're entitled to know — salary history, breakdown, leave — in one place
they can open in 5 seconds.

**What to build — `apps/mobile/app/(app)/index.tsx` (full replacement):**

**Section 1 — Gaji (Salary)**
- Current month's net pay, large and prominent ("Gaji Bersih: Rp X.XXX.XXX")
- Status chip: "Sudah Dibayar ✓" or "Menunggu Pembayaran"
- Expandable breakdown: Gaji Pokok → + Tunjangan → + Lembur → − BPJS Kes → − JHT −
  JP → − PPh 21 → = Gaji Bersih (each line labelled plainly)
- "Unduh Slip Gaji" button → opens signed PDF
- Payslip history: scrollable row list below (bulan/tahun + net + download button)
  showing the last 6 months

**Section 2 — Cuti & Izin (Leave)**
- Leave balance prominently: "Sisa Cuti: X hari" 
- "Ajukan Cuti" button → bottom sheet: type, date range, alasan, submit
- Recent requests list: type, dates, status chip (Disetujui 🟢 / Menunggu 🟡 / Ditolak 🔴)

**What is removed:** Separate Attendance, Claims, Performance, Loans tabs.
- Attendance: employees clock in from the bottom tab only if needed (or collapsed into
  a single button on this page). No standalone attendance history tab.
- Claims, Loans, Performance: not shown to employees at all in beta.

**Owner:** 🔵 Claude  
**Files to touch:**
- `apps/mobile/app/(app)/index.tsx` — full rewrite
- `apps/mobile/app/(app)/_layout.tsx` — simplify bottom tabs to: Home | Profile
- `apps/mobile/lib/payslips.ts` — already exists, reuse `getMyPayslips` +
  `getPayslipSignedUrl`
- i18n: mobile strings are inline (not next-intl) — keep inline Bahasa throughout

**Acceptance:**
- Employee opens app → immediately sees their latest net pay and leave balance
- Taps the gross → sees full breakdown (Gaji Pokok, tunjangan, lembur, BPJS, PPh 21)
- Taps "Unduh Slip Gaji" → PDF opens
- Scrolls down → sees 6 months of history, each downloadable
- Taps "Ajukan Cuti" → submits request → status updates in the same list
- No other tabs visible except Profile

---

### P0-1 · Attendance Configuration UI (G6)
**Gap:** `docs/cases/case-02-attendance-to-first-payroll.md` steps 19–21  
**Pain point:** HR cannot configure geofences, shifts, or load the holiday calendar
from the product. This is the entry condition for W4 (Attendance go-live). Without it,
every clock-in is either unvalidated (no geofence) or fails (geofence ID missing), and
overtime classification has no schedule to compare against.  
**Owner:** 🟡 Both  
**What to build:**

`Settings → Kehadiran` section with three tabs:

**Tab 1 — Lokasi Kerja (Geofences)**
- List existing geofences (name, radius, lat/lng).
- Add / edit form: nama lokasi, latitude, longitude, radius (meters).
- Delete with confirmation (warn if employees are assigned).
- Map picker is P1; lat/lng text fields are sufficient for P0.

**Tab 2 — Shift Kerja**
- List shifts (name, start time, end time, working days checkboxes).
- Add / edit form: nama shift, jam masuk, jam keluar, hari kerja (Mon–Sun toggles).
- Delete with confirmation.

**Tab 3 — Jadwal & Hari Libur**
- Assign a shift to each employee (or to all employees at once as a default).
- "Muat Hari Libur Nasional {year}" button — calls `seed_holidays(p_year)` RPC.

**Antigravity TODO(db):**
```sql
-- TODO(db): RPC seed_holidays(p_year int) — upsert Indonesian national holidays
-- for the given year into the `holidays` table. Source: Peraturan Pemerintah terbaru.
-- Claude will wire the button once the RPC exists. — Antigravity
```

**e2e:** Admin creates a geofence, creates a shift, assigns it to an employee. Verify
via Supabase select that the rows exist and the FK is set.

**Acceptance:** After setup, a mobile clock-in from within the geofence produces
`is_valid=true`; a clock-in from outside produces `is_valid=false`. No SQL access
required by HR.

---

### P0-2 · Pre-Run Validation Gate (G7)
**Gap:** `docs/cases/case-02-attendance-to-first-payroll.md` step 32  
**Pain point:** `createDraftRun` silently falls back when data is missing (e.g. no tax
profile → TK/0, no bank account → ignored). HR gets a payroll with plausible-but-wrong
numbers and no warning until an employee complains about their payslip.  
**Owner:** 🟡 Both  
**What to build:**

**Antigravity TODO(db):**
```sql
-- TODO(db): RPC payroll_readiness_check(p_company_id uuid)
-- Returns a table: (employee_id uuid, full_name text, issues text[])
-- Issues to flag per employee:
--   'NO_COMPENSATION'  — no compensation row for this employee
--   'NO_TAX_PROFILE'   — no tax_profile row
--   'NO_BANK_ACCOUNT'  — no bank_account row
--   'NO_NPWP'          — tax_profile exists but has_npwp = false (warning, not blocker)
-- Return only employees where issues array is non-empty.
-- Claude will call this before allowing draft creation. — Antigravity
```

**Claude UI:** Before the "Buat Draft" button on `/payroll/new`, call
`payroll_readiness_check`. If any employee has blocking issues (all except NO_NPWP):
- Show a blocking panel: "Data karyawan belum lengkap" listing each employee and
  their missing fields with a direct link to their profile page.
- "Buat Draft" button is disabled until the list is empty.
- NO_NPWP is a warning (yellow), not a blocker — show it but allow draft creation.

**e2e:** Attempt to create a draft with one employee missing a bank account. Assert
the button is disabled and the employee appears in the validation list with the correct
issue label. Fix the bank account; assert the button enables.

**Acceptance:** No HR user can produce a draft payroll with missing compensation or
tax data. The NO_NPWP +20% surcharge warning is visible before they commit.

---

### P0-3 · Overtime Approval UI (G5 — app follow-up)
**Gap:** `docs/cases/case-02-attendance-to-first-payroll.md` step 30  
**Status:** DB writer + pgTAP are done (Antigravity). `computeOvertimePayFromEntries`
wired in the estimator (Claude). Missing: HR/Manager cannot see or approve pending
overtime entries from the web app.  
**Owner:** 🔵 Claude  
**What to build:**

`/attendance` page → add a "Lembur Pending" tab (visible to owner/admin/manager only).

Table columns: Nama Karyawan | Tanggal | Durasi (jam:menit) | Klasifikasi | Aksi

- **Klasifikasi:** "Hari Kerja" (multiplier 1.0) or "Hari Libur/Istirahat" (multiplier 2.0)
- **Aksi:** Setujui / Tolak buttons — call `approveOvertime(entryId)` /
  `rejectOvertime(entryId)` server actions (already in `attendance/actions.ts`)
- Approved entries disappear from the pending tab; they flow into the next payroll preview automatically (already wired via `computeOvertimePayFromEntries`)
- Empty state: "Tidak ada lembur yang menunggu persetujuan"

**i18n keys needed (id + en):**
```
overtime.pendingTab, overtime.employee, overtime.date, overtime.duration,
overtime.classification, overtime.weekday, overtime.restDay, overtime.approve,
overtime.reject, overtime.emptyState, overtime.approvedSuccess, overtime.rejectedSuccess
```

**e2e:** Extend `attendance.spec.ts` — seed a pending overtime entry, load the pending
tab, approve it, run a payroll preview for the period, assert `overtimePay > 0` in
the preview line for that employee.

**Acceptance:** Case-02 steps 29/30/36 all show ✅. Manager approves overtime from
web; next payroll preview includes the correct rupiah amount.

---

## P1 — Beta polish (ship in the first beta sprint)

### P1-1 · Post-Create "Next Steps" Dashboard Checklist
**Pain point:** After creating a company, the owner lands on an empty dashboard with
no guidance. Drop-off here is invisible but predictable.  
**Owner:** 🔵 Claude  
**What to build:** A `<SetupChecklist>` component on `/dashboard` (hidden once all
steps complete) with 4 items that check themselves off as state changes:
1. ✅ Perusahaan dibuat
2. ☐ Tambah karyawan pertama → links to `/employees/new`
3. ☐ Atur jadwal kerja → links to `/settings/attendance`
4. ☐ Jalankan payroll pertama → links to `/payroll/new`

Progress stored in `company_settings.setup_checklist` JSON (or derived live from DB
state — no new column needed if we query: has employees? has shifts? has a completed payroll run?).

---

### P1-2 · Payroll-Readiness Badge on Employee List
**Pain point:** HR doesn't know which employees are missing data until they try to run
payroll. Should be visible on the employee list before payroll day.  
**Owner:** 🔵 Claude  
**What to build:** On `/employees`, add a colored dot or badge next to each employee:
- 🟢 **Siap** — compensation + tax profile + bank account all present
- 🟡 **Perhatian** — data present but no NPWP (will get +20% PPh 21)
- 🔴 **Belum lengkap** — missing at least one payroll-blocking field; tooltip lists which ones

This is a lightweight read from the same tables `payroll_readiness_check` will query —
can be computed client-side from the employee data already fetched on the list page.

---

### P1-3 · Inline PTKP / BPJS Explainers
**Pain point:** Indonesian HR at small companies often doesn't know what "TK/0" means
or why BPJS Kesehatan is 5% of salary. They pick a status randomly, which silently
breaks PPh 21 calculations.  
**Owner:** 🔵 Claude  
**What to build:** On the employee tax profile form, add a `?` tooltip or collapsible
explainer next to each field:
- **Status PTKP:** table showing TK/K + tanggungan codes in plain Bahasa ("TK = Tidak
  Kawin; angka = jumlah tanggungan")
- **NPWP:** "Tanpa NPWP, PPh 21 dikenakan tarif +20% lebih tinggi (aturan DJP)."
- **Ikut BPJS Kesehatan:** "Wajib untuk karyawan dengan gaji ≥ UMR. Iuran: 1%
  karyawan + 4% perusahaan, maks. gaji Rp 12 juta."
- **Ikut JHT / JP:** brief explanation of each program in one sentence.

---

### P1-4 · Employee Leave Balance Visible Before Payroll
**Pain point:** HR must manually check leave records before payroll to know if any
unpaid deductions apply. Currently there's no consolidated view.  
**Owner:** 🔵 Claude  
**What to build:** On the payroll preview page, below each employee's line, show a
collapsible "Detail Ketidakhadiran" section listing approved unpaid leave days in the
period (from `leave_requests` where `is_paid = false` and `status = approved`).
This is informational — HR confirms the deduction logic is correct before approving.

---

### P1-5 · Map Picker for Geofence Setup
**Pain point:** HR is unlikely to know the exact lat/lng of their office. Typing
coordinates is error-prone and alienating.  
**Owner:** 🔵 Claude  
**What to build:** On the geofence form (P0-1), add a Leaflet.js or Google Maps embed
(static embed, no API key needed for Leaflet + OpenStreetMap) where HR can:
1. Search by address or click the map to drop a pin.
2. Drag a circle to set the radius visually.
3. Coordinates and radius auto-fill the form fields.

This is P1 (not P0) because the lat/lng text fields unblock the feature; the map
picker just makes it humane.

---

### P1-6 · Mobile — Leave Approval Push Notification
**Pain point:** Managers who approve leave from mobile don't see the request unless
they happen to open the app. Approval latency frustrates employees.  
**Owner:** 🔵 Claude  
**What to build:** When a leave request is submitted (`createLeaveRequest`), send an
Expo push notification to all managers/admins/owners in the company via
`expo-notifications`. Requires storing Expo push tokens in `profiles` or a new
`push_tokens` table.

**Antigravity TODO(db):**
```sql
-- TODO(db): add push_tokens(user_id, token, platform, created_at) table if we
-- want server-side fan-out. Alternatively, Claude can do client-side fan-out from
-- the mobile app directly to Expo's push API. — Antigravity (optional — evaluate
-- whether client-side fan-out is sufficient for beta)
```

---

### P1-7 · Payslip "Explain This Number" Tooltip
**Pain point (playbook ★ item):** Employees receive a payslip with line items they
don't understand (TER A, BPJS JKM, PPh 21). They call HR to ask. HR spends time
explaining instead of doing HR work.  
**Owner:** 🔵 Claude  
**What to build:** On the mobile payslip screen and on the web payroll run detail,
add a `?` icon next to each deduction/contribution line. Tapping it shows a one-
sentence plain-Bahasa explanation:
- **PPh 21:** "Pajak penghasilan karyawan, dihitung otomatis dengan metode TER
  sesuai PMK 168/2023."
- **BPJS Kesehatan (karyawan):** "Iuran jaminan kesehatan — 1% dari gaji Anda,
  ditanggung bersama perusahaan."
- **JHT:** "Jaminan Hari Tua — tabungan pensiun wajib, bisa dicairkan saat berhenti kerja."
- *(etc. — full list in i18n file)*

---

## P2 — Post-beta (schedule after beta feedback)

| # | Feature | Pain point | Owner | Notes |
|---|---|---|---|---|
| P2-1 | Bulk import refinement (XLSX template + per-row error report) | Typing 5–20 employees manually | 🔵 Claude | CSV import ships; XLSX + error report is the high-friction fix. Playbook ★ item. |
| P2-2 | Web payslip PDF download (HR view on run page) | HR cannot download payslips from web | 🔵 Claude | Mobile covers employees; this is HR convenience. G9a. |
| P2-3 | e-Bupot export (PPh 21 CSV for DJP Online) | Annual SPT filing requires a specific format | 🔵 Claude | Needs paid plan + NPWP gating before exposing |
| P2-4 | BPJS SIPP export | Monthly BPJS payment file | 🔵 Claude | Format is public spec; straightforward to generate |
| P2-5 | Selfie liveness (anti-spoof) | Current selfie is a camera capture with no verification | 🔵 Claude | Integrate a real ML liveness SDK post-beta. G8. |
| P2-6 | Cloud Tasks retry queue for payroll worker | Direct HTTP call has no retry; if the worker dies mid-run, the run hangs | 🟠 Antigravity + 🔵 Claude | Fine for ≤5-employee beta; critical before scaling. G9b. |
| P2-7 | Admin re-link UI for orphaned employee accounts | Edge case: employee changes email after linking | 🔵 Claude | `link_employee_account` RPC already exists; just needs a UI |
| P2-8 | Multi-company accountant portal | Accountants managing 10+ companies need a cross-company view | 🔵 Claude | Company switcher exists; the portal is a separate surface |
| P2-9 | Billing & plan upgrade UI | Free tier limit enforcement + upgrade flow | 🔵 Claude | Seat limit blocks fire correctly; payment collection not yet wired |
| P2-10 | Worker adopts `computeOvertimePayFromEntries` | Worker inlines overtime banding; shared helper exists but worker hasn't adopted it yet — drift risk | 🟠 Antigravity | Noted in `handoff/overtime-pipeline.md`. Low risk for ≤5 employees. |
| P2-11 | December PPh 21 reconciliation UI | Annual true-up is computed correctly but not surfaced to HR | 🔵 Claude | Engine handles it; HR just needs to see the delta line on December runs |

---

## Sequencing — recommended sprint order

```
Sprint 1 (Beta blockers — all P0)
  ├─ P0-1  Attendance config UI        [Claude builds UI + Antigravity seed_holidays RPC]
  ├─ P0-2  Pre-run validation gate     [Antigravity builds RPC; Claude builds gate UI]
  └─ P0-3  Overtime approval UI        [Claude only — DB already done]

Sprint 2 (Beta polish — P1 subset, highest activation impact)
  ├─ P1-1  Dashboard setup checklist
  ├─ P1-2  Payroll-readiness badge on employee list
  ├─ P1-3  Inline PTKP/BPJS explainers
  └─ P1-7  Payslip "explain this number" tooltips   ← playbook ★ item

Sprint 3 (Beta polish — P1 remainder + early P2)
  ├─ P1-4  Leave balance on payroll preview
  ├─ P1-5  Map picker for geofence
  ├─ P1-6  Push notifications for leave approval
  └─ P2-1  Bulk import (XLSX + per-row error)       ← playbook ★ item

Post-beta (P2 per feedback priority)
  ─ e-Bupot, SIPP, liveness, Cloud Tasks, billing UI, multi-company portal
```

---

## Definition of "beta ready"

All three P0 items are done AND the following checklist passes end-to-end with a
real browser session (no SQL, no code, no support):

- [ ] Owner signs up, creates company, invites HR — all in < 5 min
- [ ] HR adds 5 employees with complete profiles (no red badges on the list)
- [ ] HR configures one geofence and one shift from Settings → Kehadiran
- [ ] HR seeds national holidays for the current year
- [ ] Employee accepts mobile invite, clocks in from within the geofence (record appears on live board in < 5 sec)
- [ ] Employee works 10h against an 8h shift → pending overtime entry appears
- [ ] HR/Manager approves the overtime entry from the web app
- [ ] HR opens `/payroll/new` → pre-run validation shows no blockers → creates draft
- [ ] Payroll preview shows correct gross, BPJS (both sides), PPh 21, overtime, and net for all 5 employees
- [ ] HR approves and marks as paid
- [ ] Employee opens mobile app → Slip Gaji → sees their full payslip within 2 minutes
- [ ] Employee submits leave request → manager approves → employee sees "Disetujui" without calling HR
- [ ] Employee submits a claim → HR approves → amount appears in next payroll preview
