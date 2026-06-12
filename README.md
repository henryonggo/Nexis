# Nexis — HR & Payroll SaaS for Indonesia

> Technical specification set, written to be consumed by AI coding agents (built and tested for **Google Antigravity**, also works with Cursor / Windsurf / Claude Code) and by human reviewers.

Nexis is a multi-company HR & Payroll platform for Indonesian businesses. It lets one person manage several companies from a single login, each company with its own employees, payroll runs, and role assignments. Payroll is fully localized to Indonesian regulation (PPh 21 TER, BPJS, THR, overtime). New companies start free for their first 5 employees with minimal onboarding friction (no company NPWP required while free).

## How to use these documents with an AI agent

1. Open this folder as the project root in Antigravity (or your agent IDE).
2. The agent reads **`AGENTS.md`** first — it sets the global rules and points to detailed docs.
3. Build **stage by stage** following `docs/04-roadmap.md`. Start with `docs/stages/stage-01-auth.md`.
4. Each stage doc contains: scope, screens/flows, data touched, API surface, acceptance criteria, and a suggested task breakdown you can paste into Antigravity's Agent Manager (it can run up to ~5 parallel agents).
5. The database is the source of truth for security. Read `docs/03-database-schema.md` before any data work.

### Suggested first prompt to the agent

> "Read `AGENTS.md` and `docs/02-tech-stack.md`. Scaffold the Turborepo monorepo exactly as described (`apps/web`, `apps/mobile`, `packages/types`, `packages/ui`, `supabase/`). Then implement `docs/stages/stage-01-auth.md`, including the Supabase migrations in `docs/03-database-schema.md` up to and including the auth + companies + memberships tables. Stop at the Stage 1 acceptance criteria and show me the test results."

## Document map

```
Nexis/
├── AGENTS.md                       ← agent rules (read first)
├── README.md                       ← this file
└── docs/
    ├── 00-product-vision.md        ← what we're building & for whom
    ├── 01-architecture.md          ← system design, data flow, GCP usage
    ├── 02-tech-stack.md            ← exact stack, monorepo, env, conventions
    ├── 03-database-schema.md       ← Postgres schema + RLS + full SQL
    ├── 04-roadmap.md               ← all stages, dependencies, acceptance criteria
    ├── 05-indonesian-compliance.md ← PPh 21 TER, BPJS, THR, overtime reference
    ├── 06-design-system.md         ← UI conventions, components, i18n
    ├── 07-security-compliance.md   ← RLS, UU PDP, secrets, auditing
    ├── 08-agent-boundaries.md      ← who builds what (Claude ⟷ Antigravity), handoff protocol
    ├── ROADMAP-NOTES.md            ← living "what's shipped / what's open" handoff notes
    ├── user-guide.md               ← end-user walkthrough of every app page
    ├── handoff/                    ← per-feature TODO(db)/TODO(infra) handoffs (e.g. phase5-next.md)
    └── stages/
        ├── stage-01-auth.md        ← sign up / sign in / forgot password (START)
        ├── stage-02-company-employees.md
        ├── stage-03-attendance.md
        ├── stage-04-payroll.md
        ├── stage-05-leave-claims.md
        ├── stage-06-reporting-billing.md
        └── stage-07-advanced.md
```

## Recommended Cowork skills / artifacts to support this build

- **`skill-creator`** — turn the payroll calculation rules in `docs/05-indonesian-compliance.md` into a reusable "nexis-payroll-id" skill so the agent (and future you) can validate PPh 21 / BPJS math consistently.
- **`xlsx` skill** — generate the BPJS/PPh 21 reference rate workbook and test fixtures.
- **A live Cowork artifact** — a "Nexis build tracker" HTML page that reads your roadmap and shows stage progress. (Ask Cowork: "Turn the roadmap into a live artifact I can re-open.")

## Project Overview

Nexis is a modern multi-tenant HR & Payroll SaaS tailored specifically for the Indonesian market. It is engineered with robust security at the database layer and handles complex compliance requirements out of the box.

### Features

Stages 1–6 are complete (web + mobile) and Stage 7 (advanced) is largely shipped. The
list below reflects what's implemented today.

**Authentication & accounts (Stage 1)**
- Email/password sign up with branded email verification (Resend), sign in, forgot/reset
  password, change password, resend verification, sign out.
- Session persistence (web cookies, mobile secure store), 2-hour idle auto-sign-out, and a
  show/hide password toggle on every auth form.
- Self-serve account deactivation (reversible) and a multi-company switcher with "add company".

**Multi-company tenancy & security**
- One account can own or belong to many companies, each with a distinct role
  (`owner` / `admin` / `manager` / `employee`).
- Security is enforced at the database: Row Level Security on every tenant-scoped table,
  validated by automated pgTAP tests. The app never trusts a client-supplied `company_id`.

**Companies, members & employees (Stage 2)**
- Company profile & settings; invite members by email with a per-company role; accept-invite flow.
- Employee CRUD (profile, employment type/status, compensation, PTKP status e.g. TK/0·K/1,
  employee NPWP); CSV import; active-seat tracking.
- **Free tier:** first 5 employees free per company, no company NPWP required; the 6th active
  employee is blocked with a clear upgrade CTA.
- Mobile self-service profile restricted to the employee's own record.

**Attendance & scheduling (Stage 3)**
- Mobile clock in/out with GPS geofence + selfie capture; work schedules.
- Admin/manager correction of records (audited); a **live Realtime** attendance board on the
  web with a present-today count.

**Payroll engine (Stage 4, compliance-critical)**
- Pure, exhaustively-tested TypeScript engine implementing Indonesian rules: **PPh 21 (TER,
  PMK 168/2023)**, **BPJS** (Kesehatan + Ketenagakerjaan, employee & employer sides),
  **overtime (1/173)**, the **+20% no-NPWP** surcharge, and net pay.
- Draft → run → review → approve → mark-paid lifecycle via a Cloud Run worker with Realtime
  status; per-employee breakdown; **payslip PDFs**; **THR** run type; config snapshotting so
  re-running after a rate change never alters historical runs. Money is integer rupiah end to end.

**Leave & reimbursement claims (Stage 5)**
- Leave types, balances, request → manager approval → balance update.
- Reimbursement claims with receipt upload and approval; approved items flow into the next
  payroll. Push (mobile) + email (web) notifications.

**Reporting, exports & billing (Stage 6)**
- Reports as Excel via the Cloud Run worker: payroll summary, BPJS contributions,
  **PPh 21 / e-Bupot**, **BPJS SIPP**. Quick CSV exports on list views.
- Billing & subscriptions: plan-comparison upgrade flow, seat-based pricing, invoice history,
  NPWP/BPJS capture on upgrade. (Real payment gateway is specced for handoff.)

**Advanced (Stage 7)**
- Analytics dashboard (headcount, payroll-cost trend, approvals, leave usage).
- Audit & compliance center (filterable log of sensitive actions).
- Loans & advances (kasbon) with automatic payroll deduction.
- Performance & KPI (review cycles, weighted goals with progress, employee reviews).
- Public **API & webhooks**: scoped API keys (bearer auth) and HMAC-signed webhooks with a
  delivery log.

**Platform & UX (recent enhancements)**
- **Bilingual UI** — Bahasa Indonesia (default) + English via `next-intl`, with an in-app
  locale switcher; all user-facing strings in `apps/web/messages/{id,en}.json`.
- Loading skeletons on every route, a global 404, and per-section error boundaries.
- **WhatsApp notification opt-in** (phone capture + opt-in in Settings).
- Playwright e2e: unauthenticated route guards (run unattended) plus signed-in happy-path
  money flows (payroll approve, leave approval).

---

## Technical Stack & Architecture

Nexis is built as a Turborepo monorepo with the following services:

* **apps/web:** Next.js (App Router, TypeScript, React Server Components) styled with TailwindCSS & shadcn/ui; internationalized with `next-intl` (id-ID / en).
* **apps/mobile:** Expo (React Native, TypeScript) for employee self-service (attendance, payslips, requests, profile).
* **packages/types:** Shareable TypeScript database definitions auto-generated from the Supabase Postgres schema (read-only for the app layer).
* **packages/money:** Safe integer-only IDR currency utility. All money is stored as `bigint` (no floating-point decimals) to prevent rounding errors.
* **packages/payroll:** Pure, unit-tested Indonesian payroll engine (PPh 21 TER, BPJS, overtime, THR).
* **packages/leave:** Pure leave-balance / accrual logic, unit-tested.
* **services/payroll-worker:** Cloud Run worker for payroll runs and heavy report/export generation.
* **supabase:** Postgres database with triggers, SECURITY DEFINER functions, RLS policies, and Edge Functions (notifications, public API, webhook dispatch).

---

## Running the Project

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker (for local Supabase instance)

### Setup & Run Dev Servers
1. Install dependencies:
   ```bash
   corepack enable && pnpm install
   ```
2. Start the database (runs migrations and seeds data):
   ```bash
   pnpm db:start
   ```
3. Set up environment variables inside [apps/web/.env.local](file:///c:/GIT/nexis/apps/web/.env.local) (populated automatically by the setup).
4. Run the Next.js development server:
   ```bash
   pnpm dev
   ```
   - Frontend dashboard will run at: `http://localhost:3000`
   - Local verification emails will land in Mailpit at: `http://localhost:54324`
