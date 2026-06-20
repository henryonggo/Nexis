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

---

## Update (2026-06-20) — App side landed + worker lockdown handoff

> Context: the worker is live on Cloud Run (`nexis-payroll-worker`,
> `asia-southeast1`, project `nexis-499908`) with `--allow-unauthenticated` and
> the service-role key passed via plain `--set-env-vars`. Acceptable for beta,
> must be locked down before scaling. Ref: P2-6.

### ✅ Claude (app layer) — DONE

- `apps/web/lib/cloud-tasks.ts` — new helper. Enqueues a Cloud Tasks task whose
  `httpRequest.oidcToken` makes Cloud Tasks mint a Google-signed OIDC id-token
  (as the invoker SA, `audience` = worker base URL) when it dispatches to the
  **private** Cloud Run URL. Idempotency = the task is **named** after the unit
  of work (`payroll-run-<runId>` / `report-job-<jobId>`); `ALREADY_EXISTS` is
  treated as success.
- `apps/web/lib/payroll-worker.ts` / `report-worker.ts` — enqueue via Cloud
  Tasks when configured; otherwise fall back to the direct-POST dev path. The
  static `PAYROLL_WORKER_TOKEN` is now **dev-only** (the direct path) — it never
  satisfied Cloud Run IAM and is not sent on the queue path.
- The queue path activates only when **all five** env vars are present, so prod
  must set them on the web deployment:
  - `GCP_PROJECT_ID` = `nexis-499908`
  - `GCP_REGION` = `asia-southeast1`
  - `CLOUD_TASKS_QUEUE` = e.g. `nexis-payroll`
  - `PAYROLL_WORKER_URL` = the private Cloud Run URL (no trailing slash)
  - `PAYROLL_WORKER_INVOKER_SA` = invoker SA email (below)

### 🟡 Antigravity (infra / `services/**`) — TODO

1. **Cloud Tasks queue** `nexis-payroll` in `asia-southeast1`, project
   `nexis-499908` (retry + backoff + max-attempts/dead-letter per the spec above).
2. **Invoker service account** (e.g. `payroll-enqueuer@nexis-499908.iam...`) with
   `roles/run.invoker` on `nexis-payroll-worker`. The web runtime SA needs
   `roles/cloudtasks.enqueuer` on the queue **and** `iam.serviceAccountUser` on
   the invoker SA (to set it as the task's OIDC identity).
3. **Redeploy the worker** `--no-allow-unauthenticated` (Cloud Run IAM then
   validates the OIDC token at the platform edge — the worker code needs no auth
   change; it already has no token check of its own).
4. **Secret Manager:** create a secret for the service-role key and redeploy with
   `--set-secrets=SUPABASE_SERVICE_ROLE_KEY=<secret>:latest` (drop it from
   `--set-env-vars`). Key was already rotated during debugging. Worker runtime SA
   needs `roles/secretmanager.secretAccessor`.
5. Mirror these on the web deployment's env (the five vars above).

### Acceptance (lockdown)

- `curl`-ing the worker URL with no/invalid token → `403` (private).
- Approving a run / creating a report enqueues a task that dispatches with a
  valid OIDC token and the worker processes it; no duplicate items on redelivery.
- Worker env shows the service-role key sourced from Secret Manager, not plain
  `--set-env-vars`.
