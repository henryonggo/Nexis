# docs/12 — UX & Interaction Playbook

> **Audience:** Product, Design, Engineering  
> **Scope:** How Nexis talks to its users — expectations, patterns, design language, and feedback rules for every surface.  
> **Last updated:** 2026-06-18

---

## 0. The Single Governing Principle

> **Make the right thing feel obvious. Make the wrong thing feel impossible.**

Every screen has one job. If you can't answer *"what is the user supposed to do here?"* in one sentence, the screen is doing too much.

---

## 1. Who We Are Designing For

### 1.1 Role Profiles

| Role | Mental model | Primary device | Core fear |
|---|---|---|---|
| **Owner** | Busy founder. Trusts HR but signs off on costs. Checks totals, not line items. | Web + occasional mobile | "Did I pay the right amount? Am I compliant?" |
| **HR / Admin** | Handles everything people-related. Needs to be fast, not need help. | Web (full day) | "Something will break on payroll day and it'll be my fault." |
| **Manager** | Team lead. Approves leave and reviews attendance. | Web | "I shouldn't need to log into HR software just to say yes or no." |
| **Employee** | Just wants to know their salary and when they can take leave. | Mobile (primary) | "I don't understand this deduction / my request went nowhere." |

### 1.2 What Each Role Needs to Feel

- **Owner:** *Confident.* Numbers make sense. Compliance is handled.  
- **HR:** *In control.* Nothing surprises them on payroll day. Errors surface early.  
- **Manager:** *Unbothered.* Approvals are a 10-second task, not a workflow.  
- **Employee:** *Respected.* Their pay is transparent. Their requests are visible.

---

## 2. Interaction Principles

### 2.1 Progressive Disclosure

Show the summary. Reveal the detail on demand.

```
Owner dashboard   →  Total payroll cost (one number)
                       ↳  Per-employee breakdown (tap/click)
                           ↳  Full computation trace (if needed)
```

Never lead with a table of 30 columns. Never bury the answer inside a PDF.

### 2.2 Inline Context, Not Tooltips

Indonesian HR rules are complex (PPh 21 TER, BPJS caps, overtime multipliers).  
Don't make users Google them. Surface the *why* next to the *what*.

```
❌  PPh 21: Rp 340.000   [?]  ← tooltip nobody hovers

✅  PPh 21: Rp 340.000
    TER Kategori A · 3,0% · berdasarkan penghasilan bruto Rp 11.340.000
```

### 2.3 Optimistic UI for Low-Stakes Actions

For leave requests, attendance clock-in, approval taps: update the UI immediately and reconcile in the background. Users should not wait for a spinner to do a 200ms action.

For destructive or financial actions (delete payroll run, send payslips): always require explicit confirmation.

### 2.4 Zero-State is a CTA, Not a Void

Every empty list is an invitation, not a dead end.

```
❌  "Tidak ada karyawan."

✅  Belum ada karyawan
    Tambahkan karyawan pertama untuk mulai mengelola absensi dan gaji.
    [+ Tambah Karyawan]
```

### 2.5 One Primary Action Per Screen

Every screen has exactly one primary (filled) button. Supporting actions are text or outline. Destructive actions are never prominent.

---

## 3. Design Language

### 3.1 Color System

```
Ink          #0B1220   — primary text, headings
Muted        #5B6675   — secondary text, labels, hints
Border       #E3E8EF   — dividers, card strokes
Surface      #F7F8FA   — page background
White        #FFFFFF   — card backgrounds

Primary      #2452E6   — interactive: buttons, links, active states
Primary-L    #EEF2FF   — primary tints: chips, hover backgrounds

Success      #16A34A   — Lunas, Disetujui, confirmed states
Warning      #B45309   — Menunggu, Pending, amber states
Danger       #DC2626   — errors, Ditolak, deductions
```

**Rules:**
- Danger color is for errors and deductions only — never used for primary actions
- Success green is for completed/confirmed states only — not decoration
- No dark mode until post-beta (explicit decision, see docs/11)

### 3.2 Typography Scale

```
Display      32px / 800   — Hero number (net pay, total payroll)
H1           22px / 700   — Page title
H2           18px / 700   — Section heading
H3           16px / 700   — Card heading
Body         14px / 400   — Normal content
Body-S       13px / 400   — Secondary info, timestamps
Caption      12px / 600   — Labels, tags, chip text
Micro        11px / 700   — Status badges
```

**Rules:**
- Money amounts always use **Display** or **H1** weight — never Body
- Rupiah values are right-aligned in tables, left-aligned in summary cards
- Period labels (e.g., "Mei 2026") use Body-S in Muted color

### 3.3 Spacing & Density

```
Page padding         20–24px
Card padding         20px
Section gap          16–20px
List item padding    12–16px vertical
Icon size            16px (inline), 20px (standalone)
```

Cards should breathe. Indonesian business users are not used to dense enterprise dashboards — lean toward generous whitespace over information density.

### 3.4 Shape & Elevation

```
Cards            border-radius: 12–16px, 1px border + subtle shadow
Buttons          border-radius: 10px
Chips/badges     border-radius: 999px (fully rounded)
Inputs           border-radius: 8px
Bottom sheets    border-radius: 20px top corners
```

Use **border + shadow** together for cards (not one or the other). Shadow alone reads as floating; border alone reads as flat form field.

```
shadow: 0 2px 8px rgba(0,0,0,0.06)
border: 1px solid #E3E8EF
```

---

## 4. Component Patterns

### 4.1 Status Chips

All statuses use the same pill shape. Background is a tint of the status color; text is a dark shade of the same hue.

| Status | Background | Text |
|---|---|---|
| Menunggu / Pending | `#FEF3C7` | `#92400E` |
| Disetujui / Lunas | `#DCFCE7` | `#166534` |
| Ditolak | `#FEE2E2` | `#991B1B` |
| Dibatalkan / Netral | `#F1F5F9` | `#475569` |
| Draft | `#F0F9FF` | `#0369A1` |

Never use color alone to communicate status — pair with a text label.

### 4.2 Money Display

```tsx
// Always: integer rupiah, formatted with id-ID locale
Rp 12.500.000          ← summary card (large, bold)
Rp 12.500.000          ← table cell (normal weight, right-aligned)
− Rp 340.000           ← deduction (danger color, minus prefix)
```

**Never:** `Rp 12500000`, `IDR 12,500,000`, `12.5 juta` (except informal copy)  
**Never:** floats. Store as bigint, display via `Intl.NumberFormat('id-ID')`.

### 4.3 Forms

**Label placement:** Always above the field. Never placeholder-only labels.

**Validation:** Show errors inline below the field, immediately on blur (not on submit). Use red border + red micro text.

**Required fields:** Mark required with `*` in the label. Don't mark optional — everything unmarked is assumed optional.

**Date inputs:** On web, use a date picker. On mobile, use `YYYY-MM-DD` text input with a format hint until a native date picker is wired. Always validate on blur.

**Submit state:** The submit button shows a loading indicator (spinner or text change) while the request is in flight. It's disabled during that time. Never double-submit.

### 4.4 Loading States

Three tiers — match the tier to the weight of the content:

| Tier | When | Pattern |
|---|---|---|
| **Skeleton** | Page-level data load (first visit) | Animated gray rectangles at the expected shape of the content |
| **Spinner** | Action in progress (form submit, approval) | Small spinner inside or near the triggering button |
| **Inline indicator** | Sub-section refresh | `ActivityIndicator` / spinner at the section level, content stays visible |

Never show a full-page spinner for a sub-section refresh. Never show a skeleton for a button action.

### 4.5 Error States

**Inline field error:** Red border + red micro text below the field.

**Action error (toast / banner):** Red banner at the top of the form or card. Dismissible. Includes the specific error message — never just "Terjadi kesalahan."

**Page-level error:** Centered illustration + heading + body + retry CTA. Used only when the entire page fails to load.

**Empty vs error:** Distinguish clearly:
- Empty = data exists, none returned → use zero-state CTA pattern
- Error = data fetch failed → use error pattern with retry

### 4.6 Confirmation Dialogs

Only for destructive or financially irreversible actions:
- Delete a payroll run
- Terminate an employee
- Cancel a completed payroll period

Dialog structure:
```
[Title]  — "Hapus Slip Gaji Mei 2026?"
[Body]   — One sentence on the consequence. "Tindakan ini tidak dapat dibatalkan."
[Cancel] — Outline/ghost button (left or bottom)
[Confirm] — Filled danger-red button (right or bottom), explicit label ("Ya, Hapus")
```

Never use a confirmation dialog for low-stakes actions (leave approval, attendance correction).

---

## 5. Role-by-Role Interaction Flows

### 5.1 Owner

**What they open the app for:**
- Check that payroll ran correctly
- See total headcount and cost
- Approve something an HR flagged

**What they should never need to do:**
- Configure BPJS rates or PPh 21 tables
- Understand what TER category means
- Export data just to see a summary

**Key screens & expectations:**

```
Dashboard
  ├── 3 summary cards: Karyawan aktif · Kehadiran hari ini · Payroll terakhir
  └── No tables. No config. Just totals with a drill-down link.

Payroll history
  ├── List of runs: Period, status chip, total net
  └── Tap → per-employee breakdown with variance arrows vs. prior month

Employee list
  └── Search + filter. Name, jabatan, tipe, status. Click → profile.
```

### 5.2 HR / Admin

**What they open the app for:**
- Run the monthly payroll
- Handle leave and attendance issues before payroll closes
- Onboard a new employee

**What they should never need to do:**
- Calculate a number manually to verify the app
- Dig through menus to find where to approve overtime
- Re-enter data that the system already has

**Key screens & expectations:**

```
Payroll > New Run
  ├── Pre-run checklist: green/red per employee (missing comp, tax, bank)
  ├── Explicit blocking message — cannot proceed until cleared
  └── Preview: per-employee rows with full breakdown + MoM diff arrows

Attendance
  ├── Live board: who's in, who's late, who's absent — today only
  ├── Overtime queue: approve/reject each pending entry in one click
  └── Config: geofences, shifts, schedules, holidays — all in one place

Leave
  ├── Pending requests: sorted by urgency (soonest start date first)
  ├── Approve/reject with optional note — single action, no form
  └── Balance view: per-employee per-type remaining days
```

**Critical HR trust signals:**
- Payroll preview shows computation trace (not just totals)
- Pre-run blockers surface *before* the run is started, not after
- Any change to comp/tax/bank shows an audit timestamp + who changed it

### 5.3 Manager

**What they open the app for:**
- Approve or reject a team member's leave request
- Check who on their team is in/out today

**What they should never need to do:**
- Configure anything
- Navigate more than 2 taps to approve a request

**Key screens & expectations:**

```
Leave queue (manager view)
  ├── Filtered to their team only
  ├── Each row: Name · Type · Dates · Days · Approve/Reject buttons inline
  └── Decision sends a notification to the employee immediately

Attendance (manager view)
  ├── Team roster view: present / late / absent / off today
  └── No clock-in controls — read-only visibility
```

### 5.4 Employee (Mobile)

**What they open the app for:**
- Check their salary for this month
- Download their payslip
- Request leave
- Check their leave balance

**What they should never need to do:**
- Navigate more than one tap to see their pay
- Open a PDF just to understand what was deducted
- Re-submit a leave request because they couldn't tell if it went through

**Home screen structure:**

```
Beranda (single scrollable page)
├── Greeting + name
│
├── ── GAJI ────────────────────────────
│   ├── Hero number: net pay (Display size, bold)
│   ├── Status chip: Lunas / Menunggu
│   ├── Period label: "Mei 2026"
│   ├── [Lihat rincian ▼] — expandable breakdown
│   │     Gaji Pokok       Rp 10.000.000
│   │     Tunjangan        Rp  1.500.000
│   │     Lembur           Rp    500.000
│   │     ─────────────────────────────
│   │     BPJS Kesehatan − Rp    100.000
│   │     BPJS JHT       − Rp    200.000
│   │     PPh 21          − Rp    340.000
│   │     ─────────────────────────────
│   │     Gaji Bersih       Rp 11.360.000
│   └── [⬇ Unduh Slip Gaji] — primary button
│
│   Riwayat Gaji (last 6 months)
│   └── Per row: period · net amount · [PDF] pill
│
├── ── CUTI & IZIN ─────────────────────
│   ├── Balance tiles: [12 hari Tahunan] [3 hari Sakit]
│   ├── [+ Ajukan Cuti] — expands inline form
│   │     Type chips · Start date · End date · Reason
│   │     Estimated days counter
│   │     [Kirim Pengajuan]
│   └── Request history with status chips
│
└── [Profil tab only additional tab]
```

**Employee UX non-negotiables:**
- Net pay visible without any scroll on load
- Deductions explained in plain language, not codes
- Leave request confirmation visible immediately (optimistic UI)
- Status chip on every request — no "did it go through?" anxiety

---

## 6. Mobile-Specific Patterns

### 6.1 Touch Targets

Minimum 44×44pt for all interactive elements. Never put two tappable elements within 8pt of each other.

### 6.2 Keyboard Behavior

- Forms that have a `TextInput` must handle `KeyboardAvoidingView` so fields aren't hidden behind the keyboard
- "Next" keyboard button moves focus to the next field in sequence
- Last field's keyboard button is "Done" or "Kirim" and submits the form

### 6.3 Pull-to-Refresh

All list screens (payslip history, leave requests, attendance) support pull-to-refresh. No manual "Muat ulang" button needed.

### 6.4 Haptic Feedback

- Approval / submit success → light impact haptic
- Error → notification haptic (triple tap pattern)
- Destructive confirm → warning haptic

### 6.5 Offline Behavior

When offline:
- Show last-fetched data with a "Terakhir diperbarui: X jam lalu" banner
- Disable all write actions with a "Tidak ada koneksi internet" message
- Never show an empty state when the real cause is no network

---

## 7. Web-Specific Patterns

### 7.1 Sidebar Navigation

Active state: filled primary background chip, white label.  
Hover state: light primary tint (`#EEF2FF`) background.  
Role-filtered: employees never see Payroll, HR Setup, or admin items.

### 7.2 Data Tables

Every data table follows this contract:

| Feature | Rule |
|---|---|
| Sort | All columns sortable by default, ascending first |
| Filter | Free-text search at the top of the table |
| Empty | Zero-state CTA (not blank rows) |
| Pagination | 20 rows per page default. "Tampilkan X dari Y" label |
| Row action | Hover reveals action buttons on the right — no action column that takes up space |
| Selection | Checkbox column only when bulk action exists |

### 7.3 Server Actions & Optimistic Updates

Server actions show feedback via:
1. Button enters loading state (spinner / text change) while the action is in flight
2. On success: either redirect + success banner on the destination page, or inline success message that auto-dismisses after 3 seconds
3. On error: inline error banner that persists until dismissed or corrected

Never use `alert()`. Never rely on browser `confirm()` for validation.

### 7.4 Responsive Breakpoints

```
Mobile   < 640px   — single column, collapsed sidebar
Tablet   640–1024px — two column cards, condensed sidebar
Desktop  > 1024px  — full sidebar + main content grid
```

Key HR tables (payroll preview, attendance board) must be usable at 768px — that's the minimum HR viewport.

---

## 8. Notification & Feedback Architecture

### 8.1 In-App Notifications (Toast / Banner)

| Type | Duration | Placement |
|---|---|---|
| Success | 3s auto-dismiss | Top right (web) / Top (mobile) |
| Warning | 5s auto-dismiss | Top right (web) / Top (mobile) |
| Error | Persistent (manual dismiss) | Inline near the action |
| Info | 4s auto-dismiss | Top right / Top |

### 8.2 Push Notifications (Mobile — post-beta)

| Trigger | Recipient | Message |
|---|---|---|
| Leave request submitted | Manager | "Budi mengajukan cuti 3 hari mulai 20 Jun" |
| Leave approved/rejected | Employee | "Cuti Anda 20–22 Jun telah disetujui" |
| Payslip available | Employee | "Slip gaji Mei 2026 sudah tersedia" |
| Payroll run approved | HR | "Payroll Mei 2026 telah disetujui Owner" |

### 8.3 Email Notifications

| Trigger | Recipient | Priority |
|---|---|---|
| Employee invite | New employee | P0 — must work |
| Payslip issued | Employee | P1 — beta polish |
| Leave decision | Employee | P1 — beta polish |

---

## 9. Onboarding Flow UX

### 9.1 Owner / HR First-Run Checklist

The first screen after company creation shows a setup progress checklist — not the dashboard. The dashboard is empty without data; the checklist provides direction.

```
Setup Perusahaan Anda                          3 / 6 selesai

✅ Profil perusahaan
✅ Karyawan pertama ditambahkan
✅ Profil PPh 21 karyawan diisi
⬜ Konfigurasi BPJS perusahaan
⬜ Rekening bank karyawan
⬜ Jalankan payroll pertama

[Lanjut → Konfigurasi BPJS]
```

Each item links directly to the relevant page. Completed items show a green checkmark. The CTA button always points to the next uncompleted step.

This checklist disappears permanently after the first payroll run is approved.

### 9.2 Employee First-Run

Employees land on the Home dashboard immediately. If payslips haven't been generated yet, show:

```
Gaji Bulan Ini
Slip gaji pertama Anda akan muncul di sini setelah HR
menjalankan payroll bulan ini.
```

No action needed from the employee — the state is informative, not blocking.

---

## 10. Copy & Language Standards

### 10.1 Primary Language: Indonesian (id-ID)

All user-facing strings are in Bahasa Indonesia by default. English is a secondary locale for expat users. When translating:

- Prefer common business Indonesian over formal Baku Indonesian
- Use "Anda" (not "kamu") for professional tone
- Use "karyawan" not "pegawai" (more modern, SMB-appropriate)
- Use "perusahaan" not "instansi"
- Use "jabatan" for job title, "divisi" for department

### 10.2 Error Messages

```
❌  "Error 400: Bad Request"
❌  "Terjadi kesalahan. Coba lagi."
✅  "Tanggal mulai tidak boleh setelah tanggal selesai."
✅  "Rekening bank karyawan belum diisi. Lengkapi terlebih dahulu."
```

Rules:
- Always in full Indonesian sentences
- Always actionable — tell the user what to do, not what went wrong technically
- Never expose error codes, stack traces, or internal identifiers

### 10.3 Button Labels

```
❌  Submit / OK / Yes / Confirm
✅  Simpan Perubahan / Ajukan Cuti / Jalankan Payroll / Ya, Hapus
```

Button labels use verb + noun. The user should know exactly what will happen from the label alone.

### 10.4 Placeholder vs Label

Labels: always visible above the field.  
Placeholders: supplementary hint only (example format, e.g., `YYYY-MM-DD`).  
Never use placeholder as the only label — it disappears when the user types.

---

## 11. Accessibility Baseline

### Minimum requirements (beta)

- **Contrast ratio:** 4.5:1 for body text, 3:1 for large text (WCAG AA)
- **Touch targets:** ≥44×44pt on mobile
- **Focus indicators:** Visible keyboard focus ring on all interactive elements (web)
- **Screen reader labels:** All icon-only buttons have `aria-label` / `accessibilityLabel`
- **Error association:** Error messages are linked to their input via `aria-describedby`

### Not required for beta (P2)

- WCAG AAA contrast
- Full screen reader optimization
- Reduced motion support
- High contrast mode

---

## 12. Design Review Checklist

Before any screen ships, verify:

- [ ] One clear primary action per screen
- [ ] Zero-states have a CTA, not just empty text
- [ ] All money values use `formatRupiah()` (integer rupiah, id-ID locale)
- [ ] Status chips use the correct color pair from §4.1
- [ ] Error messages are in Indonesian and actionable
- [ ] Loading state is wired up (skeleton or spinner — not nothing)
- [ ] Forms validate on blur, not only on submit
- [ ] Button labels are verb + noun (not "Submit")
- [ ] Touch targets ≥ 44pt on mobile surfaces
- [ ] Role filter is applied — employees cannot see admin surfaces

---

*This document is the source of truth for UX decisions. Conflicts between this and any component implementation should be resolved in favor of this document. Update this doc when patterns evolve — don't let it drift from the product.*
