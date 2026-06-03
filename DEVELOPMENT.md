# Nexis — Development Status

## What exists now

This repo was scaffolded from the `/docs` specification set. Stage 0 (monorepo)
and the bulk of Stage 1 (authentication + onboarding, web) are implemented.

```
nexis/
├── AGENTS.md, README.md, DEVELOPMENT.md
├── docs/                      ← full spec set (read AGENTS.md first)
├── package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .env.example
├── supabase/
│   ├── config.toml
│   ├── migrations/20260602120000_stage1_auth_companies.sql   ← profiles, companies,
│   │                              members, settings, billing, RLS, helpers, RPC
│   └── seed.sql
├── packages/
│   ├── types/   ← Database types (placeholder until `pnpm db:types`)
│   ├── money/   ← integer-rupiah helpers + unit tests ✅
│   └── payroll/ ← pure Indonesian payroll engine skeleton (full impl = Stage 4)
├── apps/
│   ├── web/     ← Next.js: sign-up/in, forgot/reset, callback, onboarding,
│   │              dashboard, company switcher, middleware, Supabase clients ✅
│   └── mobile/  ← Expo: Supabase client + structure (screens start Stage 2/3)
└── services/    ← payroll-worker (Cloud Run) — added in Stage 4
```

## Run it locally

Prerequisites: Node 20+, pnpm 9, Supabase CLI, Docker (for `supabase start`).

```bash
# 1. install
corepack enable && pnpm install

# 2. start local Supabase (applies migrations + seed)
pnpm db:start
pnpm db:reset           # applies migrations, runs seed.sql
pnpm db:types           # regenerate packages/types/src/database.ts from the live schema

# 3. configure env
cp .env.example .env.local   # paste the anon + service keys printed by `supabase start`

# 4. run the web app
pnpm --filter @nexis/web dev   # http://localhost:3000
# local email confirmations land in Inbucket: http://localhost:54324
```

## Troubleshooting `pnpm db:start`

`db:start` runs `supabase start`, which **requires Docker**. Our `config.toml` is
valid (verified against Supabase CLI 2.104.0); the usual failure is environmental:

- **"Cannot connect to the Docker daemon … Is the docker daemon running?"**
  Install Docker Desktop, open it, and wait until it says *Running* (on Windows use
  the WSL2 backend). Then re-run `pnpm db:start`. This is the #1 cause.
- **`supabase: command not found`** → run `pnpm install` first (the CLI is a
  devDependency), or use `pnpm exec supabase start`.
- **Port already in use (54321–54324)** → stop the conflicting process or change the
  ports in `supabase/config.toml`.

### Option B — develop WITHOUT Docker (hosted Supabase)

If you'd rather not run Docker locally, use a free hosted project instead:

```bash
# 1. Create a project at https://supabase.com (note the project ref + db password)
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>

# 2. Push migrations to the cloud DB (no Docker needed)
pnpm exec supabase db push

# 3. Generate types from the linked project
pnpm exec supabase gen types typescript --linked > packages/types/src/database.ts

# 4. Put the project URL + anon key (Project Settings → API) in .env.local
```

Then `pnpm --filter @nexis/web dev` runs against the cloud database. Email/auth
settings are configured in the Supabase dashboard (Authentication → URL config:
add `http://localhost:3000/auth/callback`).

## Verified in this session

- All schema SQL blocks in docs + both the Stage 1 and Stage 2 migrations parse
  against the real PostgreSQL grammar (libpg_query / pglast).
- `@nexis/money` + `@nexis/payroll` unit tests pass (rounding, BPJS bps math, caps,
  no-NPWP +20% surcharge, id-ID formatting).
- `@nexis/types` placeholder Database type compiles under `tsc --strict`.
- `config.toml` parses on Supabase CLI 2.104.0 — `db:start` only needs Docker running.

## Definition of done for Stage 1 (see docs/stages/stage-01-auth.md)

Done: sign up + email verify flow, sign in/out, forgot/reset password, onboarding
that creates a FREE company (5 seats, no NPWP) via the atomic RPC, company switcher
shell, route protection middleware, Supabase server/browser/middleware clients.

Remaining before calling Stage 1 fully complete:
- [ ] pgTAP RLS isolation tests (`supabase/tests/`) — criteria 8–10.
- [ ] Playwright e2e (signup→onboarding, forgot-password, protected-route redirect).
- [ ] Optional Google OAuth provider wiring.
- [ ] next-intl wiring (message catalogs already seeded in `apps/web/messages/`).

## Stage 2 — implemented this session (see docs/stages/stage-02-company-employees.md)

Migration `20260602130000_stage2_employees_invites.sql`:
- `employees`, `compensation`, `tax_profile`, `bank_accounts`, `invitations` + RLS
  (member-read, admin-write, and employee self-read on their own records).
- **Free-seat trigger** `enforce_free_seat_limit` — blocks the 6th active employee
  on a `free` plan with `FREE_SEAT_LIMIT_REACHED`.
- `refresh_active_seats` + trigger keeps `company_billing.active_seats` in sync.
- `accept_invitation(token)` RPC — validates token + email, creates the membership.
- FK `company_members.user_id -> profiles.id` so PostgREST can embed member profiles.

Web (`apps/web`):
- Active-company **server context** via cookie (`lib/company.ts`) + `setActiveCompany`
  action; the company switcher now persists server-side and re-scopes queries.
- App shell with left nav (Dashboard / Karyawan / Anggota).
- **Employees:** list (with seat usage), create form + action with the free-seat
  upgrade gate; seeds a `compensation` row for each new employee.
- **Members:** member list, invite-by-email (admin/manager/employee role) with a
  shareable invite link, pending-invite list + revoke.
- **Accept invite:** `/invite/[token]` page + `acceptInvite` action (auth-gated).
- Dashboard shows real employee count vs the free limit.

Remaining for full Stage 2 completion:
- [ ] Email delivery for invites (Resend) — invite link is currently shown in-app.
- [ ] Employee detail/edit + CSV import.
- [ ] pgTAP tests for the free-seat trigger and self-read policies.
- [ ] Mobile employee self-profile.

## Next stage

Stage 3 — attendance & scheduling (mobile clock-in with GPS + selfie, live web
dashboard, overtime feeding payroll). See `docs/stages/stage-03-attendance.md`.
