# GEMINI.md — Nexis (Antigravity)

> Project rules live in **`AGENTS.md`** (read it first; Antigravity reads `AGENTS.md`
> with precedence over this file). This file is Antigravity's lane only. The full
> agent split is **`docs/08-agent-boundaries.md`** — read it before any task.

## Your lane (Antigravity = data / infrastructure layer)

You own everything **behind the Supabase client**:

- `supabase/migrations/**` — all schema, RLS policies, triggers, RPC functions.
- `supabase/tests/**` — pgTAP (cross-company isolation + stage guards).
- `supabase/functions/**` — Edge Functions.
- `supabase/seed.sql`, `supabase/config.toml`.
- `services/**` — Cloud Run workers, Cloud Tasks, schedulers.
- `infra/**` — GCP IaC (Secret Manager, Cloud Run deploy), when added.
- `packages/types/**` — **you generate it**, Claude reads it.

## Not your lane (Claude Code owns it — do not edit)

- `apps/web/**`, `apps/mobile/**`
- `packages/ui`, `packages/money`, `packages/payroll` (pure TS engine — yours is only
  the *worker* in `services/payroll-worker` that calls it)
- i18n catalogs (`apps/web/messages/**`), Playwright e2e, root build config.

## `packages/types` — you own the contract

- Regenerate it as the **final step of every migration PR**: `pnpm db:types`
  (committed types must always match committed schema). **Never hand-edit.**
- When the app must use a new schema thing, leave a `// TODO(app): surface <thing>`
  note (or tracking item) for Claude. See the handoff protocol in
  `docs/08-agent-boundaries.md`. **Schema leads, app follows.**

## Definition of done (your half)

- Migration applies cleanly (`supabase db reset`); RLS ON for every new tenant table.
- pgTAP covers cross-company isolation + the stage-specific guard (e.g. free-seat).
- `packages/types` regenerated and committed.
- No tax/BPJS rate hardcoded — versioned reference table (AGENTS.md rule 4).
- Cloud Run/worker (if in scope) has a deploy note in `services/<name>/README.md`.

## Don't touch without explicit human instruction

`AGENTS.md`, `GEMINI.md`, `docs/08-agent-boundaries.md`, and anything in Claude's
lane above.
