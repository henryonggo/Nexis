# `.claude/agents/` — Nexis agent team

Three specialized subagents under a single **Fable 5 orchestrator** session
(ADR 0001, accepted 2026-07-03 — restructured from the original six-agent
team). Claude owns the **whole** repo here — both the application side and
the data side (the lane the project docs call "Antigravity"). The Supabase
client seam is kept as a *sequencing* rule (**schema leads, app follows**)
and a security model, not as a wall between two tools.

## The agents

| Agent | Model | Lane | Invoke |
|---|---|---|---|
| `db-engineer` | Sonnet | `supabase/**`, `services/**`, writes `packages/types` | Right after the plan — schema leads |
| `domain-engineer` | Sonnet | `packages/payroll \| money \| leave \| agent-tools \| orchestrator` (pure TS) | During implementation |
| `app-engineer` | Sonnet | `apps/web/**`, `apps/mobile/**`, `apps/web/e2e/**` | During implementation |

The **orchestrator** is your main session (Fable 5) — it is not a file here.
Per ADR 0001 it absorbed the former `architect` (plans, contracts, ADRs) and
`qa` (pre-merge review; test *authorship* moved into each worker's definition
of done). The R-T-C-G-F template in `ORCHESTRATION-PROMPT.md` remains the
prompt pattern for worker briefs.

## Why these model choices

- **Fable 5** for the orchestrator: decomposition, contract design, and
  pre-merge review are where a mistake is most expensive to unwind — and are
  exactly what the orchestrator model now does natively, which is why the
  separate architect/qa agents were retired.
- **Sonnet** for all three workers: RLS and SECURITY DEFINER RPCs
  (db-engineer), PPh 21 / BPJS / integer-rupiah math and agent tools
  (domain-engineer), and money-adjacent app surfaces (app-engineer) are all
  reasoning- and security-sensitive. Phase 1's UI volume is too small to
  justify a cheaper tier with weaker guarantees.

You can shift any of these — model lives in each file's `model:` frontmatter,
and `CLAUDE_CODE_SUBAGENT_MODEL` overrides all of them globally for cost
control during development.

## The non-negotiables every agent inherits (from `AGENTS.md`)

1. Security enforced at the DB — RLS ON for every tenant table; never trust a
   client-supplied `company_id`.
2. Money is integer rupiah, never float.
3. Tax/BPJS rates are versioned reference-table data, never hardcoded.
4. id-ID is the default locale; en secondary; all user-facing strings via i18n.
5. `packages/types` is generated — only `db-engineer` writes it, by regenerating.
6. Agent tools never estimate a payroll value — missing input ⇒ structured
   halt (docs/pivot/PIVOT-PHASE-1.md, ground rule 1).

## How a feature flows (the seam in single-owner mode)

```
orchestrator ──▶ plan + contracts + DB-requirements (was: architect)
                │
                ├──▶ db-engineer ──▶ migration + RLS + RPCs + pgTAP + `pnpm db:types`
                │                        (schema leads — types become the contract)
                │
                ├──▶ domain-engineer ┐  build in parallel against agreed shapes,
                └──▶ app-engineer    ┘  leaving `// TODO(db): ... — db-engineer`
                                         until real types land, then wire them in
                │
                └──▶ orchestrator reviews the diff + runs the test gate (was: qa);
                     bugs route back to the owning worker
```

`WORKED-EXAMPLE-stage5-leave.md` predates ADR 0001 (it shows the six-agent
flow); read it for the handoff *style*, not the current roster.

## Install

Place this folder at the repo root as `.claude/agents/`, commit it, then start
the orchestrator session and paste `ORCHESTRATION-PROMPT.md`.
