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

## Status

This is a greenfield specification. No code exists yet. The first deliverable for the agent is the monorepo scaffold + Stage 1 (auth).
