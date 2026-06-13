# 10 — Beta Workflow & Pain Points

> **Purpose:** define the scope, roles, and user journey for Nexis beta launch.
> This is a product document — written from the perspective of an Indonesian HR team,
> not the engineering team. Each feature is anchored to the real pain point it removes.
>
> **Related docs:**
> - `docs/09-client-workflow-playbook.md` — full lifecycle (W1–W9) with engineering detail
> - `docs/cases/case-01-registration-to-employee-access.md` — audit of signup → employee access
> - `docs/cases/case-02-attendance-to-first-payroll.md` — audit of attendance → first payroll
> - Open gaps blocking beta: G5 (overtime UI), G6 (attendance config UI), G7 (pre-run validation)

---

## Who uses Nexis (the three roles)

### 👤 Pemilik (Owner / Direktur)
The founder or business owner. Doesn't want to be the payroll person — just wants to
know it's done correctly and compliantly. Sets up the company, manages billing, and
approves major actions (e.g. payroll finalization). Has full access to everything.

**What they care about:** "Is payroll correct and on time? Am I compliant with BPJS
and pajak? Can I see a summary without digging through spreadsheets?"

**What they don't want:** to manually calculate PPh 21 TER brackets, BPJS caps, or
THR proration. To print payslips one by one. To chase employees for their tax data.

---

### 🧑‍💼 HR / Admin
The person doing the day-to-day HR work — could be a dedicated HR staff member, the
owner's assistant, or the owner themselves in a very small company. Manages the
employee roster, runs payroll, handles leave approvals, and distributes payslips.

**What they care about:** "I need to run this month's payroll without making errors.
I need to know if someone's data is missing before I submit, not after. I need
attendance records I can trust, not a spreadsheet that employees edit themselves."

**What they don't want:** to manually look up each employee's PTKP status and run a
calculator. To track BPJS contributions across 3 different tools. To call employees
asking them to submit their own bank account numbers.

---

### 📱 Karyawan (Employee)
The individual contributor. They clock in on their phone, submit leave, check their
payslip, and raise claims. They are not deeply involved in payroll mechanics — they
just want visibility and fairness.

**What they care about:** "Did I get paid correctly? Can I see the breakdown? Can I
apply for leave without chasing my manager on WhatsApp? Was my overtime counted?"

**What they don't want:** to receive a payslip they can't understand. To not know if
their leave was approved. To clock in and wonder if it was recorded.

---

## Beta scope — the 7 core workflows

These are the only features that must work end-to-end before beta launch. Everything
else is post-beta.

---

### 1. Onboarding & Company Setup

**Pain point solved:** Starting an Indonesian company means dealing with entity types,
regions, BPJS registration numbers, and NPWP — all of which affect payroll. Most small
companies manage this in a folder of documents and a mental map. There's no single
system that knows the company's setup and applies it automatically to payroll.

**What Nexis does:** Owner signs up, creates the company with a name and region, and
immediately has a working HR system for up to 5 employees. No NPWP required to start —
only collected when tax-affecting (Nexis rule: don't ask for data you don't need yet).

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | Owner | Sign up (email or Google) | Account created, email verified |
| 2 | Owner | Create company (nama perusahaan + region) | Company tenant created; Owner role assigned |
| 3 | Owner | Invite HR/Admin by email | HR receives invite link |
| 4 | HR/Admin | Accept invite | HR can access the company immediately |

**Role clarity:**
- Owner creates the company and owns billing.
- HR/Admin is invited by the Owner and takes over day-to-day operations.
- Employees are not involved at this stage.

**Beta acceptance:** Owner can sign up, create a company, and have HR fully set up
in under 5 minutes. No SQL, no configuration file, no support ticket required.

---

### 2. Employee Roster Management

**Pain point solved:** Most small Indonesian companies maintain employee data in a
combination of Excel, Google Sheets, and WhatsApp. When payroll time comes, HR must
manually look up each person's PTKP status, BPJS enrollment, and bank account. Missing
data means payroll is wrong or delayed. There's no single source of truth.

**What Nexis does:** Each employee has a structured profile with all payroll-relevant
data in one place. HR can enter data manually or import via CSV. Each incomplete
employee shows exactly which field is missing and why it matters.

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | HR | Add employee (nama, NIK, tanggal bergabung, jabatan) | Employee row created |
| 2 | HR | Enter compensation (gaji pokok, tunjangan tetap, integer rupiah) | Payroll engine has correct base |
| 3 | HR | Set tax profile (status PTKP, has NPWP yes/no) | PPh 21 category determined |
| 4 | HR | Set BPJS enrollment (Kesehatan, JHT, JP) | Contribution rates applied correctly |
| 5 | HR | Add bank account (bank, nomor rekening) | Net pay transfer destination set |
| 6 | HR | Invite employee to mobile app (from employee profile page) | Employee can clock in and see payslips |

**Role clarity:**
- HR owns all employee data entry. Employees receive an app invite after their profile is complete.
- Owner can view roster but typically doesn't manage individual employee data.
- Employees see only their own profile on mobile.

**Key Indonesian compliance details embedded:**
- PTKP statuses: TK/0, TK/1, TK/2, TK/3, K/0, K/1, K/2, K/3 — with plain-language
  explainers in Bahasa (no jargon required from HR).
- NPWP absence automatically triggers +20% PPh 21 surcharge (UU PPh requirement) —
  the system warns HR before payroll, not after.
- Free tier: up to 5 active employees. Seat-limit block shows an upgrade prompt, not
  an error.

**Beta acceptance:** HR can add all 5 employees and confirm all payroll-blocking fields
are filled before attempting a payroll run. The "payroll-readiness" status per employee
is visible without running payroll first.

---

### 3. Attendance — Daily Clock-In / Clock-Out

**Pain point solved:** "Titip absen" (buddy-punching — a colleague clocking in for
someone who isn't there) is endemic in Indonesian workplaces. HR cannot trust manual
attendance sheets. But smartphone-based systems can be gamed if they only check GPS
location — employees record from home and claim they're at the office.

**What Nexis does:** Clock-in requires both GPS geofence validation (the phone must be
within the configured radius of the office) and a selfie capture. Validation happens
server-side — the client cannot fake it. Records appear in real-time on the web
dashboard, so HR can see who's in without calling anyone.

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | HR | Configure office geofence (lat/lng + radius) — Settings → Attendance | Geofence saved; clock-ins outside it flagged `is_valid=false` |
| 2 | HR | Define shift (jam masuk, jam keluar, hari kerja) | Schedule baseline for overtime detection |
| 3 | Employee | Opens mobile app → Absensi → Clock In | GPS + selfie captured; record stored in seconds |
| 4 | Employee | Clock out at end of day | Duration calculated; overtime detection triggers |
| 5 | HR | Views live board on web | Real-time list of who clocked in/out today |
| 6 | HR | Corrects an invalid record | Audited correction; overtime re-calculated |

**Role clarity:**
- HR configures geofences and shifts (one-time setup).
- Employees do their own clock-in/out from mobile — no HR action needed daily.
- Managers and HR can see the live board and correct records.
- Employees see only their own attendance history.

**Key Indonesian compliance details:**
- Overtime is calculated per UU Cipta Kerja: hours beyond the shift schedule → 1/173 ×
  monthly wage × statutory multiplier (weekday: ×1.5 for first hour, ×2.0 after;
  rest day/holiday: ×2.0/×3.0/×4.0). The system computes this automatically from
  clock-out data — HR does not touch a calculator.
- National holiday calendar affects overtime classification. Indonesian public holidays
  are seeded for the current year.

**Beta acceptance:** An employee clocks in from within the geofence and the record
appears on the HR web dashboard within 5 seconds. A clock-in from outside the geofence
is flagged invalid (without blocking the employee). A 10-hour day against an 8-hour
shift auto-generates a pending overtime entry.

**Open gap:** G6 — the attendance config UI (geofence, shift, schedule, holiday seed)
must be built before this workflow is self-serve. Without it, setup requires direct DB
access. See `docs/cases/case-02-attendance-to-first-payroll.md`.

---

### 4. Leave Management

**Pain point solved:** Leave requests in Indonesian SMBs are typically managed via
WhatsApp messages to the direct manager, then manually logged in a spreadsheet by HR.
When payroll time comes, HR must reconcile the spreadsheet against whatever they
remember to determine unpaid leave deductions. This is error-prone and creates
disputes.

**What Nexis does:** Employees request leave from mobile. Managers (or HR) approve or
reject in the app. The leave balance and history are always current. HR sees a
consolidated view of who is out when, which feeds into payroll deduction calculations.

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | HR | Configure leave types (cuti tahunan, sakit, izin) + entitlement per employee | Leave types available in app |
| 2 | Employee | Opens mobile → Cuti → Ajukan Cuti | Selects type, dates, reason |
| 3 | Manager / HR | Receives notification → Setujui or Tolak | Employee notified; balance updated |
| 4 | HR | Views leave calendar for the period before payroll | Confirms unpaid deductions for the run |

**Role clarity:**
- HR configures leave types and annual entitlements.
- Employee initiates all requests from mobile.
- Manager approves/rejects for their direct reports; HR can approve for any employee.
- Owner can see aggregate leave data (who is out, costs) but doesn't manage approvals.

**Beta acceptance:** Employee submits a leave request on mobile, manager approves
on web or mobile, employee sees approval status without calling anyone.

---

### 5. Claims & Reimbursements

**Pain point solved:** Expense reimbursements (transport, meals, tools) in Indonesian
companies are typically submitted via WhatsApp photo + a message, then tracked in
a spreadsheet that HR maintains. By payroll time, the spreadsheet has missing receipts,
duplicate entries, and ambiguous approval status. Claims are often missed or delayed
by a month.

**What Nexis does:** Employees submit claims from mobile with receipt photos. HR
approves and the approved amount is included in the payroll run automatically — no
manual addition to the payroll spreadsheet.

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | Employee | Mobile → Klaim → Ajukan Klaim (type, amount, receipt photo) | Claim pending with attached receipt |
| 2 | HR | Reviews claim with receipt | Approve / Reject |
| 3 | HR | Runs payroll for the period | Approved claims auto-included in net pay |

**Role clarity:**
- Employees submit all claims from mobile; HR approves on web.
- Manager can approve claims for their team.
- Amounts flow into payroll automatically — HR does not enter them manually.

**Beta acceptance:** Employee submits a claim with receipt photo; HR approves it;
the amount appears in the payroll preview for that period without any manual step.

---

### 6. Payroll Run — Monthly & THR

**Pain point solved:** This is the core pain point for every Indonesian HR team.
Monthly payroll calculation involves: (1) PPh 21 using the TER method (PMK 168/2023) —
three categories (A/B/C), progressive brackets, monthly annualization; (2) BPJS
Kesehatan contributions with an income cap; (3) BPJS Ketenagakerjaan (JHT + JP + JKK
+ JKM) each with different rates and caps; (4) overtime at 1/173 × monthly wage with
UU Cipta Kerja multipliers; (5) the no-NPWP surcharge of +20% on PPh 21. Getting all
of this right manually takes a trained payroll specialist hours. Getting it wrong means
SPT corrections, BPJS disputes, and employee complaints.

THR (Tunjangan Hari Raya) at Lebaran adds another layer: proration by months of
service (wajib full after 12 months, pro-rated before).

**What Nexis does:** HR clicks "Buat Payroll". The engine runs all calculations
automatically — TER category assignment, bracket application, BPJS contributions with
caps, overtime from approved attendance records, claims, THR proration — and shows a
line-by-line preview before any money moves. HR reviews, approves, and marks as paid.
Employees receive their payslip on mobile immediately.

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | HR | Opens `/payroll/new` → selects period (bulan/tahun) and run type (monthly / THR) | Run config screen |
| 2 | HR | *(pre-run gate)* Sees blocking-issue list per employee | Missing bank account / tax profile flagged before draft |
| 3 | HR | Clicks "Buat Draft" | Engine computes all employees; preview rendered |
| 4 | HR | Reviews each employee line — gross, BPJS, PPh 21, overtime, net | Warnings visible per line (e.g. no NPWP, gaji di bawah UMR) |
| 5 | HR | Clicks "Setujui" | Run queued for async processing |
| 6 | Owner | (optional) Reviews summary — total gross, total BPJS employer cost, total PPh 21 | Final sign-off for the company |
| 7 | HR | Marks run as paid after bank transfer | Status → Dibayar |
| 8 | Employee | Opens mobile → Slip Gaji | Sees full payslip with TER breakdown, BPJS, net pay |

**Role clarity:**
- HR creates and runs payroll. Owner approves (optional escalation for larger companies).
- Manager has no payroll action — their job is attendance and leave approvals upstream.
- Employees are read-only: mobile payslip, no edit access.

**Key Indonesian compliance details the engine handles:**
- **PPh 21 TER (PMK 168/2023):** correct category (A = TK/0-TK/3, B = K/0-K/1, C = K/2-K/3)
  with the right monthly rate tables; no-NPWP +20% surcharge applied.
- **BPJS Kesehatan:** employee 1% / employer 4% of salary, capped at the BPJS income ceiling.
- **BPJS JHT:** employee 2% / employer 3.7% of salary.
- **BPJS JP:** employee 1% / employer 2% of salary, capped at JP income ceiling.
- **JKK / JKM:** employer-only, rates by risk class (set in company settings).
- **Overtime:** 1/173 × monthly wage per hour, multiplied per UU Cipta Kerja brackets
  (weekday: first 1h ×1.5 then ×2.0; rest day/holiday: first hour ×2.0, next 7 ×3.0, beyond ×4.0).
- **THR:** full salary after ≥12 months; pro-rated (months-of-service / 12) before.
- **December reconciliation:** annual PPh 21 true-up so over/underpayment is zeroed
  in the December run.
- **UMR warning:** salary below regional minimum wage flagged (not blocked — HR decides).

**Beta acceptance:** HR runs a complete payroll for 5 employees in under 10 minutes.
Every employee with a complete profile produces a correct net pay figure (verified
against the `@nexis/payroll` test fixtures). Payslip is available on mobile within
2 minutes of the run completing.

**Open gaps:**
- G5 (overtime UI, ⚠️ almost complete) — approval queue must be visible before HR can
  confirm overtime is included.
- G7 (pre-run validation gate, ❌) — blocking-issue list at step 2 is not yet built.
  Without it, HR may create a draft with missing data and get wrong (but plausible)
  results. This is a beta blocker.

---

### 7. Employee Self-Service (Mobile)

**Pain point solved:** In most Indonesian companies, employees receive a printed
payslip (or none at all) and have no way to check their own records, request leave, or
submit claims without going through HR directly. Every question becomes a WhatsApp
message to HR. HR spends significant time answering questions that the employee could
answer themselves if they had access.

**What Nexis does:** Employees get the Nexis mobile app after HR sends an invite.
From the app they can see everything that is theirs: attendance records, payslips with
a full TER/BPJS breakdown, leave balances and history, and submitted claims.

| Step | Who | Action | Outcome |
|---|---|---|---|
| 1 | HR | Clicks "Undang ke aplikasi" from employee profile | Invite email sent with link |
| 2 | Employee | Accepts invite → creates password | Account linked to their employee record |
| 3 | Employee | Mobile → Beranda | Dashboard: today's attendance status, leave balance, recent payslip |
| 4 | Employee | Mobile → Slip Gaji | Full payslip: gaji pokok, tunjangan, lembur, potongan BPJS, PPh 21, gaji bersih |
| 5 | Employee | Mobile → Cuti → Ajukan | Leave request flow |
| 6 | Employee | Mobile → Klaim → Ajukan | Claim submission with receipt photo |
| 7 | Employee | Mobile → Absensi | Clock in/out with GPS + selfie |

**Role clarity:**
- Everything in this workflow is employee-initiated, employee-visible.
- HR does not need to be involved in the daily loop once the employee is set up.
- The employee can NEVER edit payroll, approve anything, or see other employees' data.

**Beta acceptance:** After accepting an invite, an employee can complete all 7 actions
above without contacting HR. RLS (row-level security) is verified: the employee can
read only their own rows across all tables.

---

## What is NOT in beta scope

These features are real and will be built — but they are not required for a company
to run payroll correctly and compliantly in beta. Excluding them keeps the beta
tight and testable.

| Feature | Why excluded from beta |
|---|---|
| e-Bupot / BPJS SIPP export | Filing-format output — valuable after payroll is trusted, not before. Handoff: `docs/handoff/compliance-exports.md` |
| Government filing integration (DJP Online, SIPP) | Requires company NPWP + paid plan gating. Handoff: `docs/handoff/gov-filing-integration.md` |
| Analytics & HR reporting dashboard | Nice to have; not a pain point that blocks payroll |
| Multi-company view (accountant portal) | Power feature for accounting firms; not the beta persona |
| Loan management (pinjaman karyawan) | Secondary feature; no compliance obligation |
| Performance management | Entirely separate product surface |
| Billing & plan upgrade UI | Needed before public launch, not before beta |
| Admin re-link UI for employee accounts | Edge case; HR can use invite flow as workaround |
| Web payslip PDF download (HR view) | Mobile covers employees; web admin download is convenience |
| Selfie liveness (anti-spoof) | Current mock is sufficient for beta; production liveness = post-beta. Handoff: `docs/handoff/selfie-liveness.md` |
| Cloud Tasks retry queue for payroll worker | Direct HTTP is fine for ≤5-employee beta; retry semantics = post-beta. Handoff: `docs/handoff/payroll-worker-queue.md` |

---

## Open gaps that must close before beta

| Gap | Feature | Who fixes | Status | Blocker level |
|---|---|---|---|---|
| G5 | Overtime approval UI on `/attendance` | Claude | ⚠️ DB done, UI near-complete | Medium — overtime visible but not approvable without UI |
| G6 | Attendance config UI (geofences, shifts, holidays) | Claude | ❌ not started | **High — W4 cannot start from product without this** |
| G7 | Pre-run validation gate | Claude + Antigravity (small RPC) | ❌ not started | **High — payroll can produce wrong-but-plausible results** |

Everything else in `case-02` (G8 liveness, G9 web download, Cloud Tasks) is
below-the-line for beta.

**Post-beta DB contract (Antigravity, started early):** the role matrix promises Manager =
"own team" on every approval surface, but the policies are still company-wide
(`employees.manager_id` exists, unused). Handoff queued: `docs/handoff/manager-team-scoping.md`.
Medium priority — lands before multi-team companies.

---

## Role access summary

| Surface | Owner | HR/Admin | Manager | Employee |
|---|---|---|---|---|
| Company setup & settings | ✅ full | ✅ full | ❌ | ❌ |
| Employee roster (view + edit) | ✅ | ✅ | 👁 view only | ❌ (own profile only) |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Attendance config (geofences, shifts) | ✅ | ✅ | ❌ | ❌ |
| Attendance live board (all employees) | ✅ | ✅ | ✅ (own team) | ❌ |
| Attendance correction | ✅ | ✅ | ✅ (own team) | ❌ |
| Clock in / out | ❌ | ❌ | ✅ (mobile) | ✅ (mobile) |
| Overtime approval | ✅ | ✅ | ✅ (own team) | ❌ |
| Leave approval | ✅ | ✅ | ✅ (own team) | ❌ |
| Leave request | ❌ | ❌ | ✅ (own leave) | ✅ |
| Claims approval | ✅ | ✅ | ✅ (own team) | ❌ |
| Claims submission | ❌ | ❌ | ✅ (own claims) | ✅ |
| Create / run payroll | ✅ | ✅ | ❌ | ❌ |
| View payroll run summary | ✅ | ✅ | ❌ | ❌ |
| View own payslip | ✅ | ✅ | ✅ | ✅ (mobile) |
| Billing & plan | ✅ | ❌ | ❌ | ❌ |

---

## Beta success definition

A beta is successful when a company with ≤5 employees can:

1. Sign up and create their company in < 5 minutes with no support.
2. Add all employees with complete payroll profiles in < 30 minutes.
3. Have every employee clocking in on mobile by day 3.
4. Run their first payroll — correctly, to the rupiah — before day 7.
5. Have every employee view their own payslip on mobile the same day payroll is approved.
6. Not need HR to answer the question "berapa gaji bersih saya bulan ini?" — the
   employee can answer it themselves.

**North-star metric:** time from signup → first approved payroll run ≤ 7 days.
