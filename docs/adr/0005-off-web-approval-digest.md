# ADR 0005 — Off-web approval digest (WhatsApp / email)

- **Status:** Proposed (2026-07-29). **Implementation gated** on Phase-2
  prioritization from `docs/pivot/failure-log.md` — this ADR frames the
  decision so the design is ready if the Week 3/4 runs show the web-only
  gate is a real friction point. It does not authorize building yet
  (roadmap NEXT-8).
- **Context:** `docs/pivot/PIVOT-PHASE-1.md` (the approval gate "can be a
  simple web view or even WhatsApp/email digest for v0"), ADR 0002
  (approval-token mechanism), ADR 0004 (orchestrator runtime),
  `docs/pivot/ROADMAP.md` NEXT-8.
- **Deciders:** Owner (Boss); drafted by Claude Code (Fable 5) as orchestrator.

## Context

The pivot's core UX is **agent proposes → owner confirms → system executes**.
Today confirmation lives only at `/approvals` on the web: an owner/admin with
an authenticated session reviews the proposed mutation and approves/rejects,
which flips an `approval_requests` row to `approved`; the orchestrator then
re-invokes the tool with that row's id as a single-use, payload-hash-bound
token (`consume_approval`, ADR 0002).

The friction: the owner of an Indonesian SME is usually on WhatsApp on a
phone, not at a desktop. If a payroll cycle halts for approval and the owner
doesn't happen to open the web app, the workflow stalls. The pivot explicitly
names a **WhatsApp/email digest** as a legitimate v0 approval surface.

What already exists (do not rebuild):
- **`supabase/functions/send-notification`** — a dispatcher that already
  sends **email (Resend)** and **WhatsApp** (`whatsappTemplate` /
  `whatsappComponents`, `normalizePhone`). Multi-channel is solved.
- **WhatsApp opt-in** — phone capture + opt-in in Settings; the UI already
  promises "Approvals & important reminders are also sent to your WhatsApp."
- **The `approval_requests` gate** — durable, RLS-scoped, auditable,
  hash-bound, single-use (ADR 0002).

The open question this ADR answers: **how does an off-web notification let the
owner act on an approval, without weakening the security property that the
owner's authenticated session is what authorizes a mutation?**

## Options considered

### A. Notify off-web, decide on-web via deep link (RECOMMENDED for v0)

When the orchestrator opens an `approval_requests` row, fire
`send-notification` (email + WhatsApp, honoring the existing opt-in) with a
human-readable summary (reuse `describePayload` — "Buat draf payroll untuk
Juli 2026") and a **deep link to `/approvals?request=<id>`**. The link opens
the existing gate; if the owner isn't signed in, normal auth applies, then the
request is pre-selected for approve/reject.

- **Pros:** zero new trust surface — ADR 0002's gate is untouched; the
  authenticated owner still decides; RLS, audit, hash-binding, single-use all
  hold unchanged. Reuses `send-notification` and `/approvals` wholesale. The
  only new code is (1) firing the notification at request-creation time and
  (2) honoring `?request=` on the page. Small, safe, shippable.
- **Cons:** not truly "approve from inside WhatsApp" — the owner still lands
  in the web app to confirm (one tap through a login if the session lapsed).
  This is a UX cost, not a security one.

### B. Signed magic-link that approves on click (no session)

Email/WhatsApp a URL containing a signed, single-use token that, when clicked,
approves the `approval_requests` row via a public endpoint — no login.

- **Pros:** genuinely frictionless; one tap approves.
- **Cons:** the **link becomes the credential**. Anyone who sees the message
  (a forwarded WhatsApp, a synced notification on a shared device, an email on
  a lost phone) can approve a payroll mutation. It introduces a URL-bearer
  authorization path that bypasses the "authenticated owner decides" property
  the whole model rests on. Mitigations (short TTL, single-use, bind to the
  exact payload hash, re-confirm step) claw back some risk but never restore
  it fully. Rejected for v0 — revisit only if A's login friction proves real.

### C. WhatsApp interactive buttons (approve/reject in-thread)

Use WhatsApp Business API interactive message buttons; a webhook receives the
tap and approves.

- **Pros:** best UX; the approval happens in the channel the owner lives in.
- **Cons:** requires a WhatsApp BSP integration, template pre-approval, phone
  verification, and a webhook that maps an inbound button-tap to an
  `approval_requests` row — and it has the **same "who tapped, and were they
  authorized?" identity gap as B** (the sender's phone number is the only
  proof). Significant infra for a customer-zero of one. Defer to its own ADR
  once there's a paying multi-company demand.

### D. Email-only, decide on-web

Option A restricted to email (drop WhatsApp for v0).

- **Pros:** simplest; Resend is already wired.
- **Cons:** the owner is on WhatsApp, not email — this reaches the wrong
  channel. Since `send-notification` already does WhatsApp, dropping it buys
  nothing. Rejected in favor of A.

## Decision

**Option A**, pending owner sign-off and Phase-2 prioritization. Notify the
owner off-web through the existing `send-notification` (email + WhatsApp,
opt-in-aware) the moment an `approval_requests` row is opened, with a
readable summary and a deep link to the existing `/approvals` gate. The
authorization decision stays exactly where ADR 0002 put it — behind the
owner's authenticated, RLS-scoped session. In-message approval (B/C) is
explicitly **out of scope** for v0 and would need its own ADR, because it
trades the model's core security property for convenience.

## Consequences

- The approval gate's guarantees (single-use, hash-bound, RLS-scoped, owner
  decides, fully audited) are **unchanged** — this ADR only adds an outbound
  notification and a deep link, never a new way to authorize a mutation.
- Net new work when prioritized: fire `send-notification` at
  `createApprovalRequest` time (orchestrator/agent-tools lane), and honor
  `?request=<id>` on `/approvals` (app lane). Both small; no schema change.
- Notification delivery is **best-effort and must never gate the cycle** —
  same principle as the audit insert (`recordAudit`) and the `agent_cycles`
  write: a failed WhatsApp/email send is logged, never fatal. Surface a
  send failure the way audit gaps are now surfaced (ADR-adjacent to the
  2026-07-28 audit-visibility work).
- The failure log decides **if and when** this ships. If the dry/live runs
  show the owner approves promptly from the web, this stays proposed. If they
  show stalls waiting on the owner, it rises in NEXT.
