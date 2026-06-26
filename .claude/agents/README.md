# `.claude/agents/` — Nexis agent team

Six specialized subagents for running Nexis development as a coordinated team under
a single `claude --model opus` orchestrator session. Claude owns the **whole** repo
here — both the application side and the data side (the lane the project docs call
"Antigravity"). The Supabase client seam is kept as a *sequencing* rule (**schema
leads, app follows**) and a security model, not as a wall between two tools.

## The agents

| Agent | Model | Lane | Invoke |
|---|---|---|---|
| `architect` | Opus | Plans + contracts only; writes no code | First, for any non-trivial feature |
| `db-engineer` | Sonnet | `supabase/**`, `services/**`, writes `packages/types` | Right after the plan — schema leads |
| `domain-engineer` | Sonnet | `packages/payroll \| money \| leave` (pure TS) | During implementation |
| `web-engineer` | Haiku | `apps/web/**` | During implementation |
| `mobile-engineer` | Haiku | `apps/mobile/**` | During implementation |
| `qa` | Sonnet | `apps/web/e2e/**`, `packages/**` tests | Last |

The **orchestrator** is your main session (`claude --model opus`) — it is not a file
here; it's driven by `ORCHESTRATION-PROMPT.md`.

## Why these model choices

- **Opus** for the architect and the orchestrator: decomposition and contract design
  are where a mistake is most expensive to unwind (a wrong RLS contract or a bad
  type shape ripples into every downstream agent).
- **Sonnet** for `db-engineer`, `domain-engineer`, `qa`: RLS, SECURITY DEFINER RPCs,
  PPh 21 / BPJS / integer-rupiah math, and test design are reasoning-sensitive and
  security-sensitive — Haiku's mistakes here are costly.
- **Haiku** for `web-engineer` and `mobile-engineer`: high-volume UI work built
  against fixed contracts, where errors are visible and cheap to catch. ~5× cheaper.

You can shift any of these — model lives in each file's `model:` frontmatter, and
`CLAUDE_CODE_SUBAGENT_MODEL` overrides all of them globally for cost control during
development.

## The non-negotiables every agent inherits (from `AGENTS.md`)

1. Security enforced at the DB — RLS ON for every tenant table; never trust a
   client-supplied `company_id`.
2. Money is integer rupiah (`bigint`), never float.
3. Tax/BPJS rates are versioned reference-table data, never hardcoded.
4. id-ID is the default locale; en secondary; all user-facing strings via i18n.
5. `packages/types` is generated — only `db-engineer` writes it, by regenerating.

## How a feature flows (the seam in single-owner mode)

```
architect ──▶ contracts + DB-requirements + parallel map  (orchestrator approves)
                │
                ├──▶ db-engineer ──▶ migration + RLS + RPCs + pgTAP + `pnpm db:types`
                │                         (schema leads — types become the contract)
                │
                ├──▶ domain-engineer ┐
                ├──▶ web-engineer    ├─ build in parallel against agreed shapes,
                └──▶ mobile-engineer ┘   leaving `// TODO(db): ... — db-engineer`
                                          until real types land, then wire them in
                │
                └──▶ qa ──▶ e2e + package tests; bugs routed back to owning agent
```

See `WORKED-EXAMPLE-stage5-leave.md` for a concrete run.

## Install

Place this folder at the repo root as `.claude/agents/`, commit it, then start the
orchestrator with `claude --model opus` and paste `ORCHESTRATION-PROMPT.md`.

> Token note: running `db-engineer` + three app agents under an Opus orchestrator
> burns your rate limit several times faster than a single session. Watch your plan
> limits on large stages; drop app agents to a shared Haiku default via
> `CLAUDE_CODE_SUBAGENT_MODEL` if you need to economize.
