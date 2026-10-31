# Nexis

**Payroll that runs itself — you only approve.**

Nexis is an agentic operations layer for Indonesian SMEs. An agent prepares
the back-office work (payroll first: PPh 21 TER, BPJS, net pay, payslips),
stops and asks whenever an input is missing, and waits for the owner's
approval before anything changes. Customer zero: Beras Wortel.

## How it works for a new company

1. **Sign up and create your company.**
2. **Add employees** — by hand or CSV import.
3. **Set each employee's salary** (compensation, PTKP status, bank account).
4. **Open Persetujuan (`/approvals`) → Jalankan agen.** The agent drafts the
   month's payroll; you review the numbers and approve. Payslips follow.

If something is missing (no salary, no tax profile, a mid-month hire without
a contract row), the agent **halts and tells you what to fix** — it never
guesses a payroll number.

## The rules that never bend

- Payroll numbers are never estimated: missing input ⇒ structured halt.
- Money is integer rupiah, everywhere.
- Row Level Security is the security boundary; agents get no bypass.
- Every agent mutation goes through a single-use, hash-bound approval.
- Statutory rates live in reference tables, never in code.

## Repo map

| Path | What |
|---|---|
| `apps/web` | Next.js admin app — dashboard, approvals, payroll, team, pay setup |
| `apps/mobile` | Expo employee app — attendance, leave, claims, payslips |
| `packages/payroll` | Pure Indonesian payroll engine + the one statutory source |
| `packages/money` | Integer-rupiah helpers |
| `packages/agent-tools` | Typed, RLS-scoped tools the agent calls, with structured halts |
| `packages/orchestrator` | Agent runtime: plans a cycle, calls tools, raises approvals |
| `packages/types` | Generated from the Supabase schema (never edit by hand) |
| `services/payroll-worker` | Cloud Run worker that processes approved runs + reports |
| `supabase` | Migrations, RLS, RPCs, pgTAP tests, Edge Functions |

## Run it locally

Prerequisites: Node 20+, pnpm 9, Docker (for local Supabase).

```bash
corepack enable && pnpm install
```

```bash
pnpm db:start
```

```bash
pnpm dev
```

Web runs at `http://localhost:3000`; local auth emails land in Mailpit at
`http://localhost:54324`. Copy `.env.example` to `apps/web/.env.local` and fill
in the keys `supabase start` prints. The agent needs `ANTHROPIC_API_KEY`.

Before you push:

```bash
pnpm typecheck && pnpm test
```

## Where to read next

- `docs/pivot/ROADMAP.md` — the active plan (NOW / NEXT / LATER, branch map).
- `docs/pivot/failure-log.md` — every agent halt or misbehavior; it drives the roadmap.
- `docs/adr/` — architecture decisions (0007: Nexis Lite simplification).
- `docs/05-indonesian-compliance.md` — PPh 21 / BPJS / THR reference.
- `docs/06-design-system.md` — UI conventions.
- `CLAUDE.md` / `AGENTS.md` — rules for the AI engineering team.
