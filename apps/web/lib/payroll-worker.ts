import "server-only";

import { cloudTasksConfig, enqueueWorkerTask, type EnqueueResult } from "./cloud-tasks";

/**
 * Trigger the payroll worker (`services/payroll-worker`) to process a queued run.
 *
 * The worker exposes `POST /process { runId }` and only acts on runs in
 * `queued`/`draft` (idempotent — re-triggering a run already processing/completed
 * is a no-op 409, which we treat as success).
 *
 * In production the worker is private (Cloud Run `--no-allow-unauthenticated`),
 * so we enqueue a GCP Cloud Tasks task (durable retries + OIDC auth to the
 * private URL; idempotency key = runId) instead of calling it inline — approval
 * returns immediately and the platform handles delivery. When the queue isn't
 * configured (local dev) we fall back to a direct POST to the worker URL, the
 * dev trigger path documented in services/payroll-worker/README.md.
 *
 * Config (env): see ./cloud-tasks for the queue path, plus —
 *  - PAYROLL_WORKER_URL   base URL of the worker (default http://localhost:3001)
 *  - PAYROLL_WORKER_TOKEN optional bearer token for the direct-POST dev path.
 */
export type { EnqueueResult };

const DEFAULT_WORKER_URL = "http://localhost:3001";
const TRIGGER_TIMEOUT_MS = 10_000;

export async function enqueuePayrollRun(runId: string): Promise<EnqueueResult> {
  const config = cloudTasksConfig();
  if (config) {
    return enqueueWorkerTask({
      config,
      path: "/process",
      body: { runId },
      dedupeKey: `payroll-run-${runId}`,
    });
  }

  // Local/dev fallback: no Cloud Tasks queue configured — POST the worker URL
  // directly (services/payroll-worker/README.md).
  const base = (process.env.PAYROLL_WORKER_URL ?? DEFAULT_WORKER_URL).replace(/\/$/, "");
  const token = process.env.PAYROLL_WORKER_TOKEN;

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
