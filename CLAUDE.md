# CLAUDE.md — Nexis

Nexis is an **agentic operations layer** for Indonesian SMEs: agents execute
back-office payroll workflows, humans approve on `/approvals`. Not a UI-first
SaaS. Customer zero: Beras Wortel. Active plan: **`docs/pivot/PIVOT-PHASE-1.md`**
→ **`docs/pivot/ROADMAP.md`**. Read both before touching architecture,
payroll, or the agent layer.

## The team (ADR 0001)

You are the **orchestrator** (Fable 5): plan, define contracts, review every
diff, run the test gate. Delegate implementation to the workers; never write
SQL in the main session.

| Worker | Lane |
|---|---|
| `db-engineer` | `supabase/**`, `services/**`, regenerates `packages/types` |
| `domain-engineer` | `packages/payroll · money · agent-tools · orchestrator` (pure TS) |
| `app-engineer` | `apps/web/**`, `apps/mobile/**`, owns its Playwright specs |

The Supabase-client seam is a **sequencing rule**: schema leads, app follows.
App code never writes SQL — it leaves `// TODO(db): … — db-engineer`.
`packages/types` is generated; only db-engineer writes it, by regenerating.

## Non-negotiables

1. **Payroll numbers are never estimated.** Missing input ⇒ structured halt,
   never a default. This holds in every layer: engine, tools, orchestrator, UI.
2. **Money is integer rupiah.** No floats, anywhere, ever.
3. **RLS is the security boundary.** Agents get no bypass and no service-role
   client. Never trust a client-supplied `company_id`.
4. **Every agent mutation goes through the approval gate** (`approval_requests`
   → owner decides → single-use, hash-bound token). No exceptions.
5. **Rates are reference-table data**, never hardcoded.

## Engineering principles

- **Minimum code.** The best diff is the smallest one that solves the whole
  problem. Delete before you add. No speculative abstractions, no features
  outside the current roadmap item "because it's easy". If a helper exists,
  use it; if a pattern exists, match it.
- **Beautiful UI.** Everything visible follows `docs/06-design-system.md`:
  shadcn primitives, the existing Card/PageHeader/badge patterns, real empty
  and loading states, id-ID copy first (en second) written like a human wrote
  it. If a screen looks rougher than its neighbors, it isn't done.
- **Documentation is part of the diff.** Architecture decision ⇒ ADR in
  `docs/adr/`. Agent misbehavior ⇒ entry in `docs/pivot/failure-log.md`
  (that log IS the roadmap input). Scope change ⇒ update
  `docs/pivot/ROADMAP.md`. Code comments state constraints, not narration.

## Definition of done

- `pnpm typecheck` and `pnpm test` green across the workspace; web builds.
- User-facing strings in both locales (id default).
- Playwright happy path + key guard for shipped app surfaces.
- No unresolved `TODO(db)` in shipped code; docs updated per the principles.

## Don't touch without explicit owner instruction

`AGENTS.md`, `CLAUDE.md`, `docs/08-agent-boundaries.md`. Frozen legacy
surfaces listed in `docs/pivot/ROADMAP.md` get bugfixes only — no new
features outside workflow zero during Phase 1.
