# 01 — System Architecture

## High-level

```
                       ┌──────────────────────────────────────────────┐
                       │                   CLIENTS                     │
                       │                                               │
   Admin / HR  ───────▶│  apps/web   (Next.js App Router, SSR/RSC)     │
   (browser)           │             Tailwind + shadcn/ui              │
                       │                                               │
   Employee   ────────▶│  apps/mobile (React Native / Expo)           │
   (phone)             └───────────────┬──────────────────────────────┘
                                       │  HTTPS (Supabase JS client, JWT)
                                       ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                         SUPABASE                                │
        │  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌─────────────┐  │
        │  │ Postgres   │  │  Auth      │  │ Storage  │  │ Realtime    │  │
        │  │ + RLS      │  │ (GoTrue)   │  │ (files)  │  │ (live attn) │  │
        │  └─────┬──────┘  └────────────┘  └──────────┘  └─────────────┘  │
        │        │  Edge Functions (Deno): light webhooks, invites,       │
        │        │  signup hooks, signed-URL issuance                     │
        └────────┼─────────────────────────────────────────────────────-─┘
                 │  service-role calls (server-to-server)
                 ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                     GOOGLE CLOUD PLATFORM                       │
        │  Cloud Run      → payroll engine workers, PDF payslip render,    │
        │                   heavy/batch jobs, report exports              │
        │  Cloud Scheduler→ cron: monthly payroll prep, BPJS reminders    │
        │  Cloud Tasks    → durable job queue (per-company payroll runs)  │
        │  Cloud Storage  → generated payslip PDFs & report archives      │
        │  Secret Manager → service keys, signing keys                    │
        │  Cloud Logging  → structured logs / audit sink                  │
        └────────────────────────────────────────────────────────────────┘
```

## Why this split

- **Supabase** gives us Postgres (with RLS for hard multi-tenant isolation), managed Auth (email/password, OAuth, magic link, password reset), Storage, and Realtime — covering ~80% of the app with minimal ops.
- **Edge Functions** handle short, latency-sensitive, event-driven logic close to the DB (e.g. signup `before-user-created` / `after` hooks, processing invites, issuing signed URLs).
- **Google Cloud** handles anything that is **long-running, CPU-heavy, scheduled, or needs durable queuing** — primarily the **payroll engine** and **PDF generation**, which should not run inside a request/response cycle. This is also where regulated batch exports (BPJS, PPh 21) are produced.

## Request patterns

1. **Interactive reads/writes (most of the app):** client → Supabase JS → Postgres, authorized by RLS using the user's JWT. No custom backend needed.
2. **Privileged server actions (Next.js):** Next.js Route Handlers / Server Actions use the Supabase server client. For anything that must bypass RLS (e.g. provisioning a new company atomically), use a `SECURITY DEFINER` Postgres function — never the service-role key from the browser.
3. **Payroll run (async):** Admin clicks "Run payroll" → Next.js server action enqueues a Cloud Task → Cloud Run worker pulls inputs from Postgres (service role), computes PPh 21/BPJS/net pay deterministically, writes `payroll_items`, renders payslip PDFs to Cloud Storage, flips run status to `completed`. Admin UI subscribes via Realtime / polls status.
4. **Scheduled jobs:** Cloud Scheduler → Cloud Run endpoint (e.g. "open next month's payroll draft", "THR reminder before Idul Fitri", "BPJS filing reminder").

## Data flow: payroll run (canonical example)

```
Admin (web) ──"Run payroll for June 2026"──▶ Next.js Server Action
   │  validates membership/role via RLS
   ▼
Insert payroll_run (status=queued) ──▶ Cloud Tasks queue
   ▼
Cloud Run worker (service role):
   1. Load employees + compensation + attendance + config for company+period
   2. For each employee: compute gross, allowances, overtime (1/173),
      BPJS (employee+employer), PPh 21 via TER, net pay
   3. Write payroll_items + payroll_employer_costs
   4. Render payslip PDF → Cloud Storage → store signed path
   5. Update payroll_run.status = 'completed', totals
   ▼
Realtime notifies web; employees see payslip in mobile app
```

All money math is integer rupiah and uses versioned config rows (see `05-indonesian-compliance.md`) snapshotted onto the payroll_run so historical runs stay reproducible even after rates change.

## Environments

- `local` — Supabase CLI (local Postgres + studio), GCP emulators or a dev project.
- `staging` — separate Supabase project + GCP project, seeded demo data.
- `production` — separate Supabase project + GCP project, restricted access, audit logging on.

Each environment has its own secrets in GCP Secret Manager; nothing sensitive in the repo. See `02-tech-stack.md` for the env var list.

## Tenancy model (critical)

Shared-schema multi-tenancy: a single Postgres database, every tenant-scoped table carries a `company_id`, isolation enforced by RLS. We deliberately do **not** use schema-per-tenant — Supabase Realtime/PostgREST are oriented around the `public` schema, and shared-schema scales to many small companies far better for our pricing model. Details and full policies in `03-database-schema.md`.
