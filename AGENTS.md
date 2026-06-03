# AGENTS.md — Nexis

> This is the root rules file for AI coding agents (Google Antigravity, Cursor, Windsurf, Claude Code).
> Antigravity reads `AGENTS.md` with precedence over `GEMINI.md`. Keep this file authoritative and short.
> Deep detail lives in `/docs`. Always read the relevant `/docs` file before writing code for a stage.

## What Nexis is

Nexis is a multi-company HR & Payroll SaaS for the **Indonesian** market (competitors: GreatDay HR, Gadjian/Gajian, Dayforce, Talenta). It must be compliant with Indonesian payroll rules: **PPh 21 (TER method, PMK 168/2023)**, **BPJS Kesehatan**, **BPJS Ketenagakerjaan**, **THR**, and **overtime (1/173)**.

Core differentiator handled in code from day one:
- **One user account can own/belong to multiple companies** (tenants), with a **different role per company**.
- **Free tier:** the first **5 employees per company are free**. While a company is on the free tier, **do not require company NPWP** or other non-essential legal/tax fields. Only collect them when the company upgrades or runs tax-affecting payroll.

## Tech stack (do not deviate without instruction)

- **Admin web:** Next.js (App Router, TypeScript, React Server Components) + Tailwind + shadcn/ui.
- **Employee mobile:** React Native (Expo, TypeScript).
- **Backend / DB / Auth:** Supabase (Postgres + Auth + Storage + Edge Functions + Realtime).
- **Cloud:** Google Cloud Platform — Cloud Run (background workers / payroll jobs), Cloud Scheduler (cron), Cloud Storage (payslip PDFs / exports if not using Supabase Storage), Cloud Tasks (queues), Secret Manager, Cloud Logging.
- **Shared:** one `packages/types` package generated from the Supabase schema (`supabase gen types typescript`). Web and mobile both import it.
- **Monorepo:** Turborepo (`apps/web`, `apps/mobile`, `packages/types`, `packages/ui`, `supabase/`).

## Non-negotiable rules

1. **Security is enforced at the database.** Every tenant-scoped table has Row Level Security (RLS) ON. Never rely on app-layer checks alone. See `docs/03-database-schema.md`.
2. **Never trust client-supplied `company_id` for authorization.** Membership + role are verified by RLS helper functions (`auth.user_has_company_access`, `auth.user_role_in_company`).
3. **Money is integer rupiah (IDR), no decimals.** Store amounts as `bigint` (whole rupiah). Never use float for money.
4. **All tax/BPJS rates are data, not hardcoded constants.** They live in versioned reference tables (`tax_brackets`, `ptkp_rates`, `bpjs_config`) so the law can change without a redeploy. See `docs/05-indonesian-compliance.md`.
5. **Build stage by stage.** Do not start a later stage before the current one passes its acceptance criteria. See `docs/04-roadmap.md`.
6. **Tests + types before "done."** Each stage has acceptance criteria; treat them as the definition of done.
7. **Localization:** Indonesian (id-ID) is the default locale; English (en) is secondary. All user-facing strings go through i18n from the start.
8. **Timezone:** default `Asia/Jakarta` (WIB). Store timestamps as `timestamptz` (UTC), present in company timezone.

## Where to look

| Need | File |
|---|---|
| Product scope & personas | `docs/00-product-vision.md` |
| System architecture & data flow | `docs/01-architecture.md` |
| Exact stack, repo layout, env vars | `docs/02-tech-stack.md` |
| **Database schema + RLS + SQL** | `docs/03-database-schema.md` |
| Stage plan & acceptance criteria | `docs/04-roadmap.md` |
| Indonesian payroll/tax rules | `docs/05-indonesian-compliance.md` |
| UI / design system | `docs/06-design-system.md` |
| Security & data privacy (UU PDP) | `docs/07-security-compliance.md` |
| **Stage 1 build spec (start here)** | `docs/stages/stage-01-auth.md` |

## Working agreement for agents

- Read `docs/02-tech-stack.md` and the current stage spec in full before generating code.
- Prefer small, reviewable PRs scoped to one feature within a stage.
- Generate Supabase migrations as SQL files in `supabase/migrations/` — never mutate the DB ad hoc.
- After schema changes, regenerate `packages/types`.
- When a spec is ambiguous, leave a `// TODO(nexis): question` comment rather than guessing on compliance or money logic.
