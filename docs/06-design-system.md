# 06 — Design System & UX Conventions

## Principles

- **Admin web = dense & efficient** (tables, bulk actions, keyboard-friendly). **Employee mobile = simple & friendly** (big tap targets, one task per screen).
- **Indonesian-first.** Default locale `id-ID`, IDR currency formatting (`Rp 1.250.000`, dot thousands separators), `DD MMMM YYYY` dates, WIB timezone.
- **Trust & clarity around money.** Always show breakdowns; never a bare net number without "lihat rincian" (view details).

## Web component stack

- **shadcn/ui** over Tailwind. Use its primitives: Button, Input, Form, Dialog, DropdownMenu, Table (TanStack Table), Toast, Tabs, Card, Badge, Sheet (for the company switcher and side panels).
- **Layout:** left sidebar nav (collapsible), top bar with **company switcher** + user menu, content area.
- **Data tables:** server-side pagination via Supabase; column filters; CSV export action.

## Mobile (Expo)

- `expo-router` file-based routing; bottom tab nav (Home, Attendance, Payslips, Requests, Profile).
- Native modules: `expo-location` (geofence), `expo-camera` (selfie/liveness), `expo-notifications` (push), `expo-secure-store` (token).

## Design tokens (Tailwind theme extension)

```
colors:
  brand:        #1F6FEB   (Nexis blue — primary actions)
  brand-dark:   #1551B5
  accent:       #14B8A6   (teal — success/positive money in)
  danger:       #DC2626
  warning:      #F59E0B
  bg:           #F8FAFC   surface: #FFFFFF   border: #E2E8F0
  text:         #0F172A   muted: #64748B
radius: lg = 12px (cards), md = 8px (inputs/buttons)
font: Inter (web), system + Inter (mobile)
```

Brand is a placeholder — easy to retheme later. Keep all colors as tokens, never hardcoded hex in components.

## Patterns

- **Company switcher:** persistent in top bar (web) / profile header (mobile). Switching sets the active `company_id` in app context; all queries scope to it. Show the user's **role badge** for the active company.
- **Empty states** with a clear primary CTA (e.g. "Tambah karyawan pertama").
- **Free-tier banner:** when a free company has 5 active employees, show a non-blocking banner "5/5 karyawan gratis terpakai — Upgrade untuk menambah".
- **Forms:** React Hook Form + Zod; inline validation; disable submit while pending; optimistic UI only for low-risk actions (never for payroll).
- **Money input:** masked rupiah input, integer only.
- **Loading/skeletons** for tables and dashboards; **Realtime** subscriptions for attendance/payroll status.

## Accessibility & i18n

- WCAG AA contrast; labelled inputs; focus states; keyboard nav on web.
- All strings via i18n keys in `apps/web/messages/{id,en}.json` and the mobile equivalent. No literal user-facing strings in components.

## Suggested screen inventory (by stage)

- **Stage 1:** Sign up, Verify email, Sign in, Forgot password, Reset password, Onboarding (create company), Company switcher shell, Account settings (change password, sign out).
- **Stage 2:** Company settings, Members list + invite, Accept invite, Employees list/detail/create, Employee mobile profile.
- **Stage 3:** Attendance clock (mobile), Attendance dashboard (web), Schedules.
- **Stage 4:** Payroll list, Run wizard, Run review, Payslip viewer.
- **Stage 5:** Leave request/approve, Claims submit/approve, Balances.
- **Stage 6:** Reports, Exports, Billing/Upgrade, Invoices.
