# ADR 0002 — Approval-token mechanism for mutating agent tools

- **Status:** Proposed (drafted 2026-07-03; Week 2 implementation is gated on
  owner sign-off)
- **Context:** `docs/pivot/PIVOT-PHASE-1.md` (Week 2 milestone),
  `packages/agent-tools/src/tool.ts` (the executor's `requiresApproval` gate),
  ADR 0001
- **Deciders:** Owner (Boss); drafted by Claude Code (Fable 5)

## Context

The pivot's core UX is: **agent proposes → owner confirms → system executes.**
Week 1 shipped the enforcement point — `executeTool` refuses any
`requiresApproval` tool call without an approval token — but the token is
currently opaque and unverified. Week 2 lands the full payroll-cycle tool set
(`create_draft_run`, `approve_run`, `mark_run_paid`, …), all of which mutate
state, so the token must become real before any of them exist.

Constraints inherited from the pivot plan:

- Agents run RLS-scoped as tenant users — no service role, no bypass. The
  verification path must work under the same constraint.
- Every mutation must be auditable end-to-end: who proposed, who approved,
  what exactly was approved, when it executed.
- The approval surface may be a web view, or a WhatsApp/email digest — so
  approving must be a server-side state change, not something that requires
  the agent runtime to be alive at approval time.

## Options considered

### A. DB-backed approval requests (RECOMMENDED)

A new `approval_requests` table (db-engineer lane):

```
approval_requests
  id            uuid pk
  company_id    uuid → companies
  tool_name     text                 -- e.g. "approve_run"
  payload_hash  text                 -- sha-256 over canonical JSON of the tool input
  payload       jsonb                -- the exact proposed input, for display
  summary       text                 -- human-readable proposal (id-ID)
  status        enum: pending | approved | rejected | consumed | expired
  requested_by  uuid → auth.users    -- identity the agent acts as
  decided_by    uuid → auth.users    -- the approving human (owner/admin)
  decided_at    timestamptz
  expires_at    timestamptz          -- short TTL, e.g. 24h
  consumed_at   timestamptz
```

Flow:

1. Orchestrator calls a mutating tool without a token → executor returns
   `denied`; orchestrator creates an `approval_requests` row (`pending`) with
   the exact input payload + hash and surfaces it in the approval queue.
2. Owner approves in the gate UX → row becomes `approved` (RLS: only
   owner/admin roles may update status; the agent identity may only INSERT
   `pending` rows and SELECT its own).
3. Orchestrator re-invokes the tool with `approvalToken = request id`.
4. `executeTool` verifies via a single RPC (`consume_approval(request_id,
   tool_name, payload_hash)`): row exists in this company, status
   `approved`, not expired, `tool_name` matches, and the hash of the *current*
   input equals `payload_hash` — then atomically marks it `consumed` and
   returns true. Any mismatch → `denied`, audited.

Pros: approvals are durable rows — auditable, revocable, listable in the
queue UX, and they survive restarts of everything; hash binding guarantees
what executes is byte-for-byte what was approved; single-use is a row-state
transition, race-safe inside the RPC; RLS-native. Cons: needs a migration +
RPC + pgTAP (db-engineer), and one extra round-trip per mutation — irrelevant
at payroll frequency.

### B. Stateless signed tokens (JWT-style)

Owner approval mints a signed token over (tool, payload hash, expiry).
Pros: no schema change. Cons: needs a signing key the app layer holds
(violates "no privileged material in the agent path"), revocation and
single-use require state anyway, and there's no natural queue/audit surface —
the approval *queue* is the product here. Rejected.

### C. Per-tool bespoke confirmation columns

E.g. reuse `payroll_runs.status = 'approved'` as the gate. Pros: zero new
tables for run approval specifically. Cons: only covers tools whose target
row already has an approval state; no uniform mechanism for employee CRUD,
BPJS prep, etc.; approval semantics scatter per table. Rejected as the
general mechanism — but tools whose domain row has its own status (payroll
runs) keep those transitions too; the approval request is the *authorization
to call the tool*, not a replacement for domain state.

## Decision

**Option A**, pending owner sign-off. `packages/agent-tools` gains a
`verifyApproval` step inside `executeTool` (calls the `consume_approval`
RPC); `packages/types` picks up the new table when db-engineer regenerates.

## TODO(db) items this creates (for db-engineer, Week 2)

1. `approval_requests` table as above + RLS: agent identity INSERT
   `pending`/SELECT own company's rows; owner/admin UPDATE status
   pending→approved/rejected; nobody deletes.
2. `consume_approval(request_id uuid, tool_name text, payload_hash text)
   returns boolean` — SECURITY INVOKER, atomic approved→consumed transition.
3. `audit_logs` INSERT policy for `entity = 'agent_tools'` (already flagged in
   `packages/agent-tools/src/tool.ts` and `docs/pivot/week1-staging-readiness.md`).
4. pgTAP: double-consume race, expired token, cross-company token, tampered
   payload hash.

## Consequences

- The executor's contract is unchanged for read-only tools; mutating tools
  gain exactly one verification round-trip.
- The approval queue UX (Phase 1's only new UI) is a view over
  `approval_requests` — no bespoke state store.
- Canonical-JSON hashing must be deterministic across the orchestrator and
  the verifier; the hash is computed in `packages/agent-tools` (single
  implementation, unit-tested) and stored at request creation.
