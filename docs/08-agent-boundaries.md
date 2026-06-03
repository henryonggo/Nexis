# 08 — Agent Boundaries (Claude Code ⟷ Antigravity)

> Authoritative division of labor between the two AI coding agents working on Nexis.
> Both agents MUST read this before touching the repo. The goal: **zero file overlap**,
> so the two can work the *same stage in parallel* without stepping on each other.
> Referenced from `AGENTS.md` (root rules). When this doc and `AGENTS.md` disagree,
> `AGENTS.md` wins on *project rules*; this doc wins on *who-does-what*.

## The split model

We do **not** split by stage (stages depend on each other — see `04-roadmap.md`).
We split by **layer**. There is one hard seam: the **Supabase client boundary**.

- **Antigravity owns everything *behind* the database client** — schema, RLS, RPCs,
  SQL, compliance reference tables, Edge Functions, GCP workers.
- **Claude Code owns everything *in front of* it** — Next.js web, Expo mobile,
  shared TS packages, UI, business logic that runs in the app, e2e tests.
- The **generated `packages/types`** is the contract between them. Antigravity
  produces it (by regenerating after a migration); Claude consumes it.

```
        CLAUDE CODE                │            ANTIGRAVITY
  (application / presentation)     │      (data / infrastructure)
                                   │
  apps/web  apps/mobile           │   supabase/migrations
  packages/ui  money  payroll*    │   supabase/tests (pgTAP)
  i18n, components, actions       │   supabase/functions (Edge)
  Playwright e2e                  │   supabase/seed.sql, config.toml
                                   │   services/** (Cloud Run, GCP)
                  └──── packages/types ────┘
                     (Antigravity writes,
                       Claude reads)
```

\* `packages/payroll` is **pure TypeScript** (no DB) so it stays with Claude. The
*Cloud Run worker* that *calls* the engine (`services/payroll-worker`) is Antigravity.

## Ownership table (the source of truth)

| Path / Area | Owner | Notes |
|---|---|---|
| `apps/web/**` | **Claude** | Next.js App Router, server actions, route handlers, UI |
| `apps/mobile/**` | **Claude** | Expo / React Native screens |
| `packages/ui/**` | **Claude** | shadcn/Tailwind components, design tokens |
| `packages/money/**` | **Claude** | integer-rupiah helpers (pure TS) |
| `packages/payroll/**` | **Claude** | pure Indonesian payroll engine + fixtures |
| `apps/web/messages/**`, i18n catalogs | **Claude** | id-ID + en strings |
| Playwright / web e2e tests | **Claude** | `apps/web/**/*.spec.ts` |
| `turbo.json`, `tsconfig*.json`, `pnpm-workspace.yaml`, `package.json` (root) | **Claude** | build/monorepo config |
| `supabase/migrations/**` | **Antigravity** | all schema, RLS, RPC, triggers |
| `supabase/tests/**` (pgTAP) | **Antigravity** | DB-level isolation/limit tests |
| `supabase/functions/**` | **Antigravity** | Edge Functions |
| `supabase/seed.sql`, `supabase/config.toml` | **Antigravity** | seed + local stack config |
| `services/**` | **Antigravity** | Cloud Run workers, Cloud Tasks, schedulers |
| `infra/**` (GCP IaC, when added) | **Antigravity** | Secret Manager, Cloud Run deploy |
| `packages/types/**` | **Antigravity writes / Claude reads** | generated contract — see below |
| `docs/**` | **Shared, append-only** | see "Docs" rule below |
| `AGENTS.md`, `CLAUDE.md`, this file | **Human-only** | neither agent edits without explicit instruction |

If a path is not listed, infer from the seam: *does it run inside Postgres/GCP, or
inside the app?* When genuinely unsure, leave a `// TODO(boundary): ...` and stop —
do not edit across the seam.

## `packages/types` — the contract

This is the one file both agents care about. Rules:

1. **Only Antigravity writes it**, and only by regenerating:
   `pnpm db:types` (or `supabase gen types typescript`). Never hand-edit.
2. Antigravity regenerates it **as the final step of any migration PR**, so the
   committed types always match the committed schema.
3. **Claude treats it as read-only.** If Claude needs a column/table/RPC that isn't
   in the types yet, Claude does **not** add a migration — it files a request (below).

## Handoff protocol (how a feature crosses the seam)

Most stage features touch both layers. The flow:

**Claude needs new data (column, table, RPC, policy):**
1. Claude writes the app code against the *desired* shape and marks the gap:
   `// TODO(db): need column employees.termination_date (date, nullable) — Antigravity`
   For an RPC: `// TODO(db): need rpc accept_invitation(token uuid) returning ...`.
2. Claude opens (or comments on) a tracking item listing every `TODO(db)` for the stage.
3. Antigravity implements the migration + RLS + (if needed) RPC, runs `pnpm db:types`,
   commits both. The `TODO(db)` is now satisfiable.
4. Claude removes the `TODO(db)` and wires the real generated type.

**Antigravity ships a schema change the app must use:**
1. Antigravity migration + regenerated `packages/types` lands first.
2. Antigravity leaves a `// TODO(app): surface <thing>` note (or tracking item) for Claude.
3. Claude builds the UI/action against the new types.

Rule of thumb: **schema leads, app follows** within a feature, but they can be built
concurrently because Claude codes against the agreed shape and only blocks on the
final type regen.

## Conflict-avoidance rules

1. **Never edit a file owned by the other agent.** Cross-seam needs go through the
   handoff protocol, not a direct edit.
2. **One migration timestamp per migration.** Antigravity owns the migration sequence;
   Claude never creates files in `supabase/migrations/`.
3. **Branch naming:** `claude/<stage>-<feature>` and `antigravity/<stage>-<feature>`
   so PRs are attributable and reviewable. Small PRs scoped to one feature (per AGENTS.md).
4. **Cross-review the seam:** when an app PR depends on a schema PR, link them; merge
   the schema PR (with regenerated types) first.
5. **Docs are append-only and sectioned.** When adding to a stage spec, add a new
   subsection rather than rewriting the other agent's prose, to avoid merge conflicts.

## Definition of done — per agent (each stage)

**Antigravity is done when:**
- Migration applies cleanly (`supabase db reset`), RLS ON for every new tenant table.
- pgTAP tests cover cross-company isolation + any stage-specific guard (e.g. free-seat).
- `packages/types` regenerated and committed.
- No tax/BPJS rate hardcoded — lives in a versioned reference table (AGENTS.md rule 4).
- Cloud Run/worker (if in scope) has a deploy note in `services/<name>/README.md`.

**Claude is done when:**
- `pnpm --filter @nexis/web typecheck` + build pass; mobile typechecks.
- All new strings go through i18n (id-ID + en).
- Money is integer rupiah end-to-end (no float in the app).
- Playwright e2e for the happy path + the key guard (e.g. free-seat upgrade CTA).
- No `TODO(db)` left unresolved for a shipped feature.

## Worked example — Stage 3 (Attendance)

| Work item | Owner |
|---|---|
| `attendance`, `shifts`, `schedules`, `geofences` tables + RLS | Antigravity |
| `record_attendance(...)` RPC, overtime-computation SQL/view | Antigravity |
| pgTAP: employee can only insert own attendance | Antigravity |
| Storage bucket + policy for selfies | Antigravity |
| `packages/types` regen | Antigravity |
| Mobile clock in/out screen, GPS geofence check, selfie capture | Claude |
| Web live attendance dashboard (Realtime subscribe) | Claude |
| Admin correction UI (calls the RPC) | Claude |
| i18n strings, Playwright dashboard test | Claude |

Both start day one: Claude builds UI against the agreed table/RPC shapes with
`TODO(db)` markers; Antigravity lands schema + types; Claude swaps in real types.
