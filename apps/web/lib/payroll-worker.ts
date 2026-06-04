import "server-only";

/**
 * Trigger the payroll worker (`services/payroll-worker`) to process a queued run.
 *
 * The worker exposes `POST /process { runId }` and only acts on runs in
 * `queued`/`draft` (idempotent — re-triggering a run already processing/completed
 * is a no-op 409, which we treat as success). In production this enqueue should
 * go through GCP Cloud Tasks (retries, rate-limiting, OIDC auth to the private
 * Cloud Run URL); locally and by default we POST the worker URL directly, which
 * is the dev trigger path documented in services/payroll-worker/README.md.
 *
 * Config (env):
 *  - PAYROLL_WORKER_URL   base URL of the worker (default http://localhost:3001)
 *  - PAYROLL_WORKER_TOKEN optional bearer token (OIDC id-token) for a private
 *                         Cloud Run deployment.
 */
export type EnqueueResult = { ok: true } | { ok: false; error: string };

const DEFAULT_WORKER_URL = "http://localhost:3001";
const TRIGGER_TIMEOUT_MS = 10_000;

export async function enqueuePayrollRun(runId: string): Promise<EnqueueResult> {
  const base = (process.env.PAYROLL_WORKER_URL ?? DEFAULT_WORKER_URL).replace(/\/$/, "");
  const token = process.env.PAYROLL_WORKER_TOKEN;

  // TODO(infra): when a Cloud Tasks queue is provisioned, enqueue a task here
  // (idempotency key = runId) instead of calling the worker inline, so approval
  // returns immediately and the platform handles retries. Antigravity owns the
  // queue + worker IAM; this app only needs the queue name + worker URL.

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRIGGER_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ runId }),
      signal: controller.signal,
      cache: "no-store",
    });

    // 409 = run already past queued (concurrent/duplicate trigger) — idempotent OK.
    if (res.ok || res.status === 409) return { ok: true };

    const text = await res.text().catch(() => "");
    return { ok: false, error: `Worker responded ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `Could not reach payroll worker: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}
