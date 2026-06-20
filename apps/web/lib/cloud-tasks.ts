import "server-only";

import { CloudTasksClient } from "@google-cloud/tasks";

/**
 * Cloud Tasks enqueue helper for the payroll/report worker
 * (`services/payroll-worker`).
 *
 * In production the worker is deployed to Cloud Run with
 * `--no-allow-unauthenticated`, so a request only reaches it if it carries a
 * valid Google-signed OIDC id-token for an identity with `run.invoker` on the
 * service. The web app cannot mint that token itself; instead it enqueues a
 * Cloud Tasks task whose `oidcToken` tells Cloud Tasks to sign one (as the
 * configured invoker service account) when it dispatches the task. Cloud Tasks
 * also gives us durable retries + backoff for free, so approval/report creation
 * can return immediately instead of blocking on the worker.
 *
 * Idempotency: the task is *named* after the logical unit of work (run/job id),
 * so a duplicate enqueue is rejected by Cloud Tasks (`ALREADY_EXISTS`) rather
 * than producing a second task — and the worker itself is idempotent on the run
 * status, so a redelivered task is a no-op.
 *
 * Config (env) — all five required to enable the queue path; if any is missing
 * the callers fall back to a direct HTTP POST (the local/dev trigger path):
 *  - GCP_PROJECT_ID            GCP project hosting the queue + worker
 *  - GCP_REGION                queue + Cloud Run region (e.g. asia-southeast1)
 *  - CLOUD_TASKS_QUEUE         queue id (e.g. nexis-payroll)
 *  - PAYROLL_WORKER_URL        base URL of the private Cloud Run worker
 *  - PAYROLL_WORKER_INVOKER_SA service-account email with `run.invoker`,
 *                              impersonated by Cloud Tasks to mint the OIDC token
 *
 * The queue, the worker IAM binding, and the invoker service account are
 * provisioned by Antigravity (`infra/**`); this app only consumes their names.
 */

export type EnqueueResult = { ok: true } | { ok: false; error: string };

export type CloudTasksConfig = {
  projectId: string;
  location: string;
  queue: string;
  /** Base URL of the private Cloud Run worker, no trailing slash. */
  workerUrl: string;
  invokerServiceAccount: string;
};

/**
 * Read the Cloud Tasks config from the environment, or `null` when it is not
 * fully configured (local dev / before infra lands) so callers can fall back to
 * a direct HTTP POST.
 */
export function cloudTasksConfig(): CloudTasksConfig | null {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_REGION;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const workerUrl = process.env.PAYROLL_WORKER_URL;
  const invokerServiceAccount = process.env.PAYROLL_WORKER_INVOKER_SA;

  if (!projectId || !location || !queue || !workerUrl || !invokerServiceAccount) {
    return null;
  }

  return {
    projectId,
    location,
    queue,
    workerUrl: workerUrl.replace(/\/$/, ""),
    invokerServiceAccount,
  };
}

// Reuse one client across warm serverless invocations (it holds a gRPC channel).
let client: CloudTasksClient | null = null;
function tasksClient(): CloudTasksClient {
  if (!client) client = new CloudTasksClient();
  return client;
}

// Cloud Tasks task names allow only [A-Za-z0-9_-], max 500 chars. Sanitize the
// caller-supplied dedupe key so it can never produce an invalid name.
function safeTaskId(dedupeKey: string): string {
  return dedupeKey.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 500);
}

// gRPC status code 6 = ALREADY_EXISTS — a task with this name was already
// enqueued (or ran) recently. That is exactly the idempotent outcome we want.
const GRPC_ALREADY_EXISTS = 6;

export async function enqueueWorkerTask(params: {
  config: CloudTasksConfig;
  /** Worker endpoint path, e.g. "/process" or "/process-report". */
  path: string;
  body: Record<string, unknown>;
  /** Idempotency key — uniquely identifies this unit of work (runId / jobId). */
  dedupeKey: string;
}): Promise<EnqueueResult> {
  const { config, path, body, dedupeKey } = params;
  const tasks = tasksClient();
  const parent = tasks.queuePath(config.projectId, config.location, config.queue);
  const url = `${config.workerUrl}${path}`;
  const name = `${parent}/tasks/${safeTaskId(dedupeKey)}`;

  try {
    await tasks.createTask({
      parent,
      task: {
        name,
        httpRequest: {
          httpMethod: "POST",
          url,
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify(body)).toString("base64"),
          // Tells Cloud Tasks to attach a Google-signed OIDC id-token (minted as
          // the invoker SA, with the worker URL as audience) so the request
          // satisfies Cloud Run IAM on the private service.
          oidcToken: {
            serviceAccountEmail: config.invokerServiceAccount,
            audience: config.workerUrl,
          },
        },
      },
    });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number }).code === GRPC_ALREADY_EXISTS) {
      return { ok: true };
    }
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `Cloud Tasks enqueue failed: ${message}` };
  }
}
