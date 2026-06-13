# Handoff — Payroll/report worker retry queue (Cloud Tasks) — 🟡 OPEN (Antigravity)

> **Owner:** Antigravity (infra). Post-beta. Source: `docs/10-beta-workflow-painpoints.md`
> ("Cloud Tasks retry queue … direct HTTP is fine for ≤5-employee beta").

## Problem

The web enqueues the payroll and report workers with a **direct HTTP fetch**
(`apps/web/lib/payroll-worker.ts`, `apps/web/lib/report-worker.ts`, both carrying
`TODO(infra)`). If the worker is unreachable the run is rolled back to `draft` and the admin
must retry by hand — no durable queue, no automatic retry, no backoff. Fine for a tiny beta;
not for real load or transient worker downtime.

## TODO(infra) — Antigravity

1. Provision a **Cloud Tasks** queue (or equivalent) in `infra/**`; the web enqueues a task
   instead of calling the worker URL directly.
2. Worker endpoint becomes the task target: idempotent on `payroll_run_id` (a redelivered task
   must not double-process — guard on run status), with retry + exponential backoff and a dead
   letter after N attempts.
3. On terminal failure, set the run `status = 'failed'` with a reason the app can show.
4. Same shape for the report worker.

## App follow-up — Claude

- Replace the direct-fetch bodies in `payroll-worker.ts` / `report-worker.ts` with the
  enqueue call; drop the rollback-to-draft hack in `payroll/actions.ts` `approveRun` once the
  queue guarantees delivery (keep the typed-error surface). Mostly deletion.

## Acceptance

- Approving a run enqueues a task; a transiently-down worker still processes the run on retry
  with no duplicate `payroll_items`/`payslips`.
- A permanently-failing run lands `failed` with a visible reason; no silent stuck `queued`.
