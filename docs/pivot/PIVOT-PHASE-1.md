# Nexis Pivot — Phase 1: Invert the Architecture (July 2026)

**Status: ACTIVE.** This plan supersedes prior Nexis feature roadmaps.
**Owner:** Boss. **Executor:** Claude Code (Fable 5 as orchestrator).
**Customer zero:** Beras Wortel (CV Agri Pangan Global), Palembang.

## Strategic Reframe (read this first, every session)

Nexis is no longer a UI-first HR/Payroll SaaS. It is an **agentic operations
layer for Indonesian SMEs**. Agents execute back-office workflows end-to-end;
humans approve, they do not operate. The existing compliance engine
(PPh 21 TER, BPJS, THR, UMP/UMK) is the moat — it becomes the tool layer
that agents call.

**Workflow zero:** run Beras Wortel's July payroll cycle via agent, with human
approval gates. Everything in Phase 1 serves this single deliverable.

## What stays (do not touch without explicit instruction)

- **RLS-first security model in Supabase** — agents get NO bypass; they operate
  through the same RLS-scoped access as any tenant user.
- **Integer rupiah** money handling.
- **`packages/types`** as the sole db-engineer-generated contract.
- **The Antigravity boundary seam** — this is now the **tool interface boundary**:
  everything agent-callable lives on the far side of the seam as typed,
  auditable operations.

## What changes

- **New package: `packages/agent-tools`** — typed tool definitions wrapping
  existing domain operations (payroll run, employee CRUD, tax calc, BPJS
  submission prep). Each tool: input schema from `packages/types`, RLS-scoped
  execution, structured result, audit log entry. No tool may mutate state
  without an approval token for mutations flagged `requires_approval`.
- **New package: `packages/orchestrator`** — the agent runtime. Fable 5 as
  orchestrator model. Responsibilities: plan a payroll cycle, call tools,
  surface an approval queue, halt on ambiguity rather than guess.
- **Approval gate UX** — minimal surface (can be a simple web view or even
  WhatsApp/email digest for v0): agent proposes → owner confirms → system
  executes. This replaces the traditional payroll UI as the primary UX.
- **Failure log** — every agent error, hallucinated value, wrong tool call,
  or halt gets logged to `docs/pivot/failure-log.md` with date, workflow
  step, cause, and fix. **This log is the product roadmap.**

## Agent architecture re-evaluation (Week 1 task)

The six-agent structure (Opus architect + Sonnet db/domain/QA + Haiku
web/mobile) was designed around 4.x model limits. With Fable 5:

- Test whether **one Fable 5 orchestrator + a small number of Sonnet workers**
  covers what six agents did. Hypothesis: architect + QA collapse into the
  orchestrator; web/mobile engineers shrink because UI surface shrinks.
- Keep the R-T-C-G-F orchestration template as the prompt pattern for any
  remaining subagent definitions.
- Decision recorded as an ADR in `docs/adr/` **before** restructuring.

## Weekly milestones

- **Week 1 (by Jul 10):** ADR on agent architecture; `packages/agent-tools`
  scaffolded with 2 read-only tools (fetch employee roster, compute PPh 21
  for one employee) working end-to-end against staging data.
- **Week 2 (by Jul 17):** Full payroll-cycle tool set (gross → PPh 21 TER →
  BPJS → net) callable by orchestrator; approval-token mechanism implemented.
- **Week 3 (by Jul 24):** Dry run of complete Beras Wortel July payroll on
  staging; every discrepancy vs. the manual/legacy calculation logged.
- **Week 4 (by Jul 31):** Live July payroll executed via agent with owner
  approval. Failure log reviewed; Phase 2 scope drafted from it.

## Ground rules for Claude Code sessions

1. **Payroll numbers are never estimated.** If an input is missing, halt and ask.
2. All money in **integer rupiah**, all the way through agent tool results.
3. Do not build UI beyond the approval gate in Phase 1.
4. Do not add features outside workflow zero, even if adjacent and easy.
5. Every session that changes architecture updates the relevant ADR.

## Kickoff prompt (paste into first Claude Code session)

> Read `docs/pivot/PIVOT-PHASE-1.md` and the root `CLAUDE.md`. Then: (1) inventory the
> current monorepo structure and map which existing domain operations are
> candidates for `packages/agent-tools`; (2) draft the Week 1 ADR comparing
> the six-agent architecture vs. a Fable 5 orchestrator + reduced worker set;
> (3) propose the scaffold for `packages/agent-tools` respecting the
> Antigravity seam and `packages/types` contract. Plan mode first — show me
> the plan before writing code.
