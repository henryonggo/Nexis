import "server-only";

/**
 * Trigger the payroll worker (`services/payroll-worker`) to process a report job.
 *
 * The worker exposes `POST /process-report { jobId }` and only acts on jobs in
 * `pending`/`processing` (idempotent — re-triggering a job already finished is a
 * 409, which we treat as success). It renders the XLSX, uploads it to the private
 * `reports` storage bucket, and advances the job to `completed` with `output_path`.
 *
 * In production this enqueue should go through GCP Cloud Tasks (retries,
 * rate-limiting, OIDC auth to the private Cloud Run URL); locally and by default
 * we POST the worker URL directly — the dev trigger path documented in
 * services/payroll-worker/README.md.
 *
 * Config (env):
 *  - REPORT_WORKER_URL / PAYROLL_WORKER_URL   base URL (default http://localhost:3001)
 *  - PAYROLL_WORKER_TOKEN                       optional bearer token (OIDC id-token)
 */
export type EnqueueResult = { ok: true } | { ok: false; error: string };

const DEFAULT_WORKER_URL = "http://localhost:3001";
const TRIGGER_TIMEOUT_MS = 15_000;

export async function enqueueReportJob(jobId: string): Promise<EnqueueResult> {
  const base = (
    process.env.REPORT_WORKER_URL ??
    process.env.PAYROLL_WORKER_URL ??
    DEFAULT_WORKER_URL
  ).replace(/\/$/, "");
  const token = process.env.PAYROLL_WORKER_TOKEN;

  // TODO(infra): when a Cloud Tasks queue is provisioned, enqueue a task here
  // (idempotency key = jobId) instead of calling the worker inline, so report
  // creation returns immediately and the platform handles retries. Antigravity
  // owns the queue + worker IAM; this app only needs the queue name + worker URL.

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
