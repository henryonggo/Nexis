# CLAUDE.md — Nexis (Claude Code)

> Project rules live in **`AGENTS.md`** (read it first). This file is Claude Code's
> lane only. The full agent split is **`docs/08-agent-boundaries.md`** — read it
> before any task that might cross the database seam.

## Strategic Direction (July 2026 pivot)

Nexis is an **agentic operations layer**, not a UI-first SaaS. Agents execute
back-office workflows; humans approve via approval gates. Beras Wortel is
customer zero. The active execution plan is **`docs/pivot/PIVOT-PHASE-1.md`** —
read it at the start of any session touching architecture, payroll, or the
agent layer.

Non-negotiables (unchanged): RLS-first security, integer rupiah,
`packages/types` as the sole generated contract, Antigravity seam as the
agent-tool boundary. Payroll values are never estimated — halt and ask.
Do not build features outside workflow zero (Beras Wortel payroll cycle)
during Phase 1.

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
