# 02 — Tech Stack, Repo Layout & Conventions

## Fixed stack

| Layer | Choice | Notes |
|---|---|---|
| Admin web | **Next.js** (App Router, TypeScript) | RSC + Server Actions; deploy to Vercel or Cloud Run |
| Styling | **Tailwind CSS** + **shadcn/ui** | design tokens in `06-design-system.md` |
| Employee mobile | **React Native + Expo** (TypeScript) | EAS build; expo-router for navigation |
| DB / Auth / Storage | **Supabase** | Postgres 15+, GoTrue auth, RLS everywhere |
| Edge logic | **Supabase Edge Functions** (Deno) | auth hooks, invites, signed URLs |
| Heavy/batch/cron | **Google Cloud** | Cloud Run, Cloud Tasks, Cloud Scheduler, Cloud Storage, Secret Manager, Cloud Logging |
| Shared types | `supabase gen types typescript` | published as `packages/types` |
| State/data (web) | TanStack Query + Supabase client | |
| Forms/validation | React Hook Form + **Zod** | Zod schemas shared web/mobile |
| i18n | `next-intl` (web), `i18n-js`/`expo-localization` (mobile) | default `id-ID`, fallback `en` |
| Money | integer rupiah (`bigint`) + `dinero.js`-style helpers in `packages/money` | never floats |
| Testing | Vitest (unit), Playwright (web e2e), Detox/Maestro (mobile), pgTAP (RLS) | |
| CI | GitHub Actions | lint, typecheck, test, supabase db lint, migration check |

## Monorepo layout (Turborepo)

```
nexis/
├── AGENTS.md
├── package.json            (pnpm workspaces + turbo)
├── turbo.json
├── apps/
│   ├── web/                Next.js admin app
│   │   ├── app/            App Router routes
│   │   ├── components/
│   │   ├── lib/supabase/   server + browser clients
│   │   └── messages/       id.json, en.json
│   └── mobile/             Expo React Native employee app
│       ├── app/            expo-router
│       ├── components/
│       └── lib/
├── packages/
│   ├── types/              generated Supabase types + domain types
│   ├── ui/                 shared component primitives (where feasible)
│   ├── money/              integer-rupiah helpers
│   └── payroll/            pure, framework-free Indonesian payroll engine
│                           (PPh21 TER, BPJS, overtime, THR) — unit tested,
│                           imported by the Cloud Run worker
├── services/
│   └── payroll-worker/     Cloud Run service (Node/TS) using packages/payroll
├── supabase/
│   ├── migrations/         timestamped SQL migrations (source of truth)
│   ├── functions/          edge functions (Deno)
│   └── seed.sql            reference data: tax brackets, PTKP, BPJS config
└── infra/
    └── gcp/                IaC (Terraform) for Cloud Run/Tasks/Scheduler/Storage
```

**Key idea for the agent:** the payroll math lives in `packages/payroll` as a **pure library** with no DB/HTTP dependencies, so it can be unit-tested exhaustively against fixtures and reused by both the Cloud Run worker and any preview/estimator UI. Treat it as the most safety-critical code in the system.

## Environment variables

Browser-safe (prefixed `NEXT_PUBLIC_` / `EXPO_PUBLIC_`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Server-only (never shipped to client; in GCP Secret Manager / Vercel encrypted env):
- `SUPABASE_SERVICE_ROLE_KEY` (server actions / worker only)
- `SUPABASE_JWT_SECRET`
- `GCP_PROJECT_ID`, `GCP_REGION`
- `CLOUD_TASKS_QUEUE`, `PAYROLL_WORKER_URL`
- `CLOUD_STORAGE_BUCKET_PAYSLIPS`
- `PAYSLIP_SIGNING_KEY`
- `RESEND_API_KEY` (or Supabase SMTP) for transactional email

## Coding conventions

- **TypeScript strict** everywhere. No `any` in committed code without a `// eslint-disable` reason.
- **Naming:** DB = `snake_case`; TS = `camelCase`; React components = `PascalCase`.
- **Migrations:** every schema change is a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. After applying, run `supabase gen types typescript` and commit the result to `packages/types`.
- **RLS:** every new table ships with its RLS policies in the same migration. A migration that adds a tenant-scoped table without RLS should fail review.
- **Server vs client:** never import the service-role key into a client bundle. Privileged DB work goes through `SECURITY DEFINER` functions or the Cloud Run worker.
- **Errors & i18n:** user-facing errors are i18n keys, not raw strings.
- **Commits/PRs:** conventional commits; one feature per PR; include test updates.

## Supabase clients

- `apps/web/lib/supabase/server.ts` — cookie-based server client (RSC, Server Actions, Route Handlers).
- `apps/web/lib/supabase/client.ts` — browser client.
- `apps/mobile/lib/supabase.ts` — Expo client with `AsyncStorage` session persistence + auto-refresh.

## GCP deployment notes

- Payroll worker: containerized, deployed to **Cloud Run**, invoked only by Cloud Tasks/Scheduler with OIDC auth (no public unauthenticated access).
- Secrets via Secret Manager mounted as env at deploy.
- Terraform in `infra/gcp` provisions: Cloud Run service, Cloud Tasks queue, Scheduler jobs, Storage bucket (uniform access, private), service accounts with least privilege.
