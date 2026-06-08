# Nexis — User Guide

A walkthrough of every page in the app, who can see it, and what it's for. The UI is
Indonesian (id-ID); page names below use the in-app labels.

> **Screenshots:** to be added once the UI is visually stable. Placeholders are marked
> `![…](…)` — capture at 1280px (desktop) and 375px (mobile) and drop into
> `docs/img/` when ready.

## Roles

- **Pemilik (Owner)** — full access, billing, can create/own companies.
- **Admin** — manage employees, payroll, approvals, members.
- **Manajer (Manager)** — approve leave/claims for their team.
- **Karyawan (Employee)** — self-service (mobile app): submit attendance, leave, claims.

The web app is the admin/manager surface. Employees primarily use the mobile app.

---

## Getting started

### Sign up / Sign in
- **Create account** (`/sign-up`) — name, email, password. You'll receive a branded
  verification email; the link confirms your address and returns you to **Sign in**.
- **Sign in** (`/sign-in`) — email + password. Use the eye icon to show/hide the
  password. **Forgot password?** sends a reset link; **Reset password** sets a new one.
- After ~2 hours of inactivity you're signed out automatically for security.

### Onboarding
First sign-in with no company sends you to **Detail perusahaan** to create your first
company (name + optional industry). You become its Pemilik.

---

## Pages

> All pages below live behind sign-in and are scoped to the **active company** (the
> switcher in the top-left header). Use **+ Tambah perusahaan** in that switcher to add
> another company; you become its owner and switch to it immediately.

![App shell](docs/img/app-shell.png)

### Dashboard (`/dashboard`)
Landing overview for the active company — headline figures and quick status. *All roles
with access.*

### Karyawan — Employees (`/employees`)
The employee directory. Add/edit employees, salary, and employment details; export to
CSV. *Owner/Admin.*

### Kehadiran — Attendance (`/attendance`)
Live attendance status for today, with a real-time event log of clock-in/out. *Owner/
Admin/Manager.*

### Cuti — Leave (`/leave`)
Leave approval queue. Pending requests show employee, type, date range, days, reason,
and any attachment; managers **Setujui** (approve) or **Tolak** (reject, with an
optional note). History table below. *Owner/Admin/Manager approve.*

### Klaim — Claims (`/claims`)
Reimbursement claim queue — same approve/reject flow as Cuti, with amount, receipt, and
whether the claim is taxable. Approved claims can flow into payroll. *Owner/Admin/
Manager approve.*

### Pinjaman — Loans (`/loans`)
Employee loans / advances (kasbon). Track principal and installments; deductions are
applied in the payroll run. *Owner/Admin.*

### Penggajian — Payroll (`/payroll`)
Run and review payroll. Computes gross/net with Indonesian components (PPh 21, BPJS),
loan deductions, and approved claims; export results. *Owner/Admin.*

### Kinerja — Performance (`/performance`)
Performance & KPI tracking and reviews. *Owner/Admin/Manager; employees view their own
on mobile.*

### Analitik — Analytics (`/analytics`)
Aggregate dashboards across HR/payroll data. *Owner/Admin.*

### Laporan — Reports (`/reports`)
Generate and download reports/exports (payroll, attendance, etc.). *Owner/Admin.*

### Tagihan — Billing (`/billing`)
Plan and billing details. Free for the first 5 employees, then a flat plan; capture tax
identifiers (NPWP) here. *Owner.*

### Audit (`/audit`)
Audit & compliance log of sensitive actions, for review/export. *Owner/Admin.*

### API — Developer (`/developer`)
Manage API keys and webhooks for the public API integration. *Owner/Admin.*

### Anggota — Members (`/members`)
Invite teammates to the active company and assign roles (Admin/Manajer/Karyawan).
Invites are sent by email; if email isn't configured the invite link is shown in-app.
*Owner/Admin.*

### Pengaturan — Settings (`/settings`)
Your account. Shows your email and a **Nonaktifkan akun** (deactivate account) action —
this signs you out and deactivates the account (reversible via support). *All signed-in
users.*

---

## Tips

- **Switching companies:** use the company chip in the header; your selection is
  remembered.
- **Something failed to load?** Pages show a "Terjadi kesalahan" panel with **Coba lagi**
  (retry) and a link back to the dashboard — the browser back button also works normally.
- **Mobile:** the top nav scrolls horizontally; the **Sign out** button stays in the
  header.
