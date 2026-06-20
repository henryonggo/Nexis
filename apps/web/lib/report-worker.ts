import "server-only";

import { cloudTasksConfig, enqueueWorkerTask, type EnqueueResult } from "./cloud-tasks";

/**
 * Trigger the payroll worker (`services/payroll-worker`) to process a report job.
 *
 * The worker exposes `POST /process-report { jobId }` and only acts on jobs in
 * `pending`/`processing` (idempotent — re-triggering a job already finished is a
 * 409, which we treat as success). It renders the XLSX, uploads it to the private
 * `reports` storage bucket, and advances the job to `completed` with `output_path`.
 *
 * In production the worker is private (Cloud Run `--no-allow-unauthenticated`),
 * so we enqueue a GCP Cloud Tasks task (durable retries + OIDC auth to the
 * private URL; idempotency key = jobId) instead of calling it inline. When the
 * queue isn't configured (local dev) we fall back to a direct POST — the dev
 * trigger path documented in services/payroll-worker/README.md.
 *
 * Config (env): see ./cloud-tasks for the queue path, plus —
 *  - REPORT_WORKER_URL / PAYROLL_WORKER_URL   base URL (default http://localhost:3001)
 *  - PAYROLL_WORKER_TOKEN                       optional bearer token (direct-POST dev path)
 */
export type { EnqueueResult };

const DEFAULT_WORKER_URL = "http://localhost:3001";
const TRIGGER_TIMEOUT_MS = 15_000;

export async function enqueueReportJob(jobId: string): Promise<EnqueueResult> {
  const config = cloudTasksConfig();
  if (config) {
    return enqueueWorkerTask({
      config,
      path: "/process-report",
      body: { jobId },
      dedupeKey: `report-job-${jobId}`,
    });
  }

  // Local/dev fallback: no Cloud Tasks queue configured — POST the worker URL
  // directly (services/payroll-worker/README.md).
  const base = (
    process.env.REPORT_WORKER_URL ??
    process.env.PAYROLL_WORKER_URL ??
    DEFAULT_WORKER_URL
  ).replace(/\/$/, "");
  const token = process.env.PAYROLL_WORKER_TOKEN;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRIGGER_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/process-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jobId }),
      signal: controller.signal,
      cache: "no-store",
    });

    // 409 = job already past pending (concurrent/duplicate trigger) — idempotent OK.
    if (res.ok || res.status === 409) return { ok: true };

    const text = await res.text().catch(() => "");
    return { ok: false, error: `Worker responded ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `Could not reach report worker: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}
