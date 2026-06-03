# CLAUDE.md — Nexis (Claude Code)

> Project rules live in **`AGENTS.md`** (read it first). This file is Claude Code's
> lane only. The full agent split is **`docs/08-agent-boundaries.md`** — read it
> before any task that might cross the database seam.

## Your lane (Claude Code = application layer)

You own everything **in front of the Supabase client**:

- `apps/web/**` — Next.js App Router, server actions, route handlers, UI.
- `apps/mobile/**` — Expo / React Native.
- `packages/ui`, `packages/money`, `packages/payroll` — pure TS + components.
- i18n catalogs (`apps/web/messages/**`), Playwright e2e, root build config.

## Not your lane (Antigravity owns it — do not edit)

- `supabase/migrations/**`, `supabase/tests/**`, `supabase/functions/**`,
  `supabase/seed.sql`, `supabase/config.toml`
- `services/**`, `infra/**`
- `packages/types/**` is **read-only** for you — it's generated from the schema.

## When you need new data

Don't write SQL or migrations. Code against the desired shape and mark the gap:

```ts
// TODO(db): need column employees.termination_date (date, nullable) — Antigravity
```

List your `TODO(db)` items for the stage in the tracking item. Antigravity lands the
migration + regenerates `packages/types`; then you swap in the real generated type
and delete the `TODO(db)`. See the handoff protocol in `docs/08-agent-boundaries.md`.

## Definition of done (your half)

- `pnpm --filter @nexis/web typecheck` + build pass; mobile typechecks.
- All user-facing strings via i18n (id-ID default, en secondary).
- Money is integer rupiah everywhere — never float (AGENTS.md rule 3).
- Playwright e2e for the happy path + the key guard.
- No `TODO(db)` left unresolved for a shipped feature.

## Don't touch without explicit human instruction

`AGENTS.md`, `CLAUDE.md`, `docs/08-agent-boundaries.md`, and anything in
Antigravity's lane above.
