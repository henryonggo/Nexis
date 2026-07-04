import { z } from "zod";
import { defineTool } from "../tool";

/**
 * Payroll-run lifecycle mutations (all requires_approval), mirroring the
 * server actions in apps/web/app/(app)/payroll/actions.ts:
 *
 *   approve_payroll_run   draft → queued, then hand off to the worker via the
 *                         injected enqueuePayrollRun effect (ADR 0003); any
 *                         enqueue problem rolls the run back to draft so a run
 *                         is never left queued with nobody coming for it.
 *   cancel_payroll_run    draft|queued|processing|failed → cancelled.
 *   mark_payroll_run_paid completed → paid, only once every payroll item is
 *                         confirmed disbursed (the money path re-checks even
 *                         though the UI also guards it).
 *
 * DB business gates raised by enforce_payroll_run_gating on draft → queued
 * (PLAN_GATE_FREE, NPWP_REQUIRED) surface as structured halts.
 */

const runInput = z.object({ runId: z.string().uuid() });

export interface RunTransitionOutput {
  runId: string;
  status: string;
}

export const approvePayrollRun = defineTool<z.infer<typeof runInput>, RunTransitionOutput>({
  name: "approve_payroll_run",
  description:
    "Approve a draft payroll run: moves it to queued and hands it to the payroll worker. MUTATES STATE — requires an approval token and the enqueuePayrollRun effect.",
  requiresApproval: true,
  input: runInput,
  async run(input, ctx) {
    // Require the enqueue capability BEFORE transitioning: approving without
    // a worker handoff would strand the run in `queued`.
    const enqueue = ctx.effects?.enqueuePayrollRun;
    if (!enqueue) {
      return {
        halt: [
          {
            code: "enqueue_capability_missing",
            message:
              "No enqueuePayrollRun effect injected (ADR 0003) — approving would strand the run in queued.",
            needs: "ToolContext.effects.enqueuePayrollRun wired to apps/web/lib/payroll-worker.ts",
          },
        ],
      };
    }

    const { data: transitioned, error } = await ctx.supabase
      .from("payroll_runs")
      .update({ status: "queued" })
      .eq("id", input.runId)
      .eq("company_id", ctx.companyId)
      .eq("status", "draft") // only a draft can be approved (idempotent)
      .select("id")
      .maybeSingle();

    if (error) {
      // Business gates from enforce_payroll_run_gating → structured halts.
      if (error.message.includes("PLAN_GATE_FREE")) {
        return {
          halt: [
            {
              code: "plan_gate_free",
              message: "Monthly payroll runs are not available on the free plan.",
              needs: "plan upgrade (Tagihan) before processing monthly payroll",
            },
          ],
        };
      }
      if (error.message.includes("NPWP_REQUIRED")) {
        return {
          halt: [
            {
              code: "npwp_required",
              message: "The company NPWP is not filled in.",
              needs: "company NPWP in settings before processing monthly payroll",
            },
          ],
        };
      }
      throw new Error(`payroll_runs update: ${error.message}`);
    }
    if (!transitioned) {
      return {
        halt: [
          {
            code: "run_not_draft",
            message: `Run ${input.runId} is not in draft status (or not visible in this company) — nothing was approved.`,
          },
        ],
      };
    }

    const enqueued = await enqueue(input.runId);
    if (!enqueued.ok) {
      // Worker unreachable — roll back (only if the worker hasn't already
      // moved it past queued) so approval can be retried.
      await ctx.supabase
        .from("payroll_runs")
        .update({ status: "draft" })
        .eq("id", input.runId)
        .eq("company_id", ctx.companyId)
        .eq("status", "queued");
      return {
        halt: [
          {
            code: "worker_unreachable",
            message: `Payroll worker could not be reached (${enqueued.error}). Run rolled back to draft — retry approval.`,
          },
        ],
      };
    }

    return { data: { runId: input.runId, status: "queued" } };
  },
});

export const cancelPayrollRun = defineTool<z.infer<typeof runInput>, RunTransitionOutput>({
  name: "cancel_payroll_run",
  description:
    "Cancel a payroll run that has not been paid (draft/queued/processing/failed). MUTATES STATE — requires an approval token.",
  requiresApproval: true,
  input: runInput,
  async run(input, ctx) {
    const { data: transitioned, error } = await ctx.supabase
      .from("payroll_runs")
      .update({ status: "cancelled" })
      .eq("id", input.runId)
      .eq("company_id", ctx.companyId)
      // "processing" included so a run stuck on a dead worker can be cleared,
      // then reactivated via create_draft_payroll_run. Never a paid run.
      .in("status", ["draft", "queued", "processing", "failed"])
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`payroll_runs update: ${error.message}`);
    if (!transitioned) {
      return {
        halt: [
          {
            code: "run_not_cancellable",
            message: `Run ${input.runId} is not in a cancellable state (draft/queued/processing/failed) — completed or paid runs cannot be cancelled.`,
          },
        ],
      };
    }
    return { data: { runId: input.runId, status: "cancelled" } };
  },
});

export const markPayrollRunPaid = defineTool<z.infer<typeof runInput>, RunTransitionOutput>({
  name: "mark_payroll_run_paid",
  description:
    "Close a completed payroll run as paid, only when every employee's payroll item is confirmed disbursed. MUTATES STATE — requires an approval token.",
  requiresApproval: true,
  input: runInput,
  async run(input, ctx) {
    const { count, error: unpaidErr } = await ctx.supabase
      .from("payroll_items")
      .select("id", { count: "exact", head: true })
      .eq("payroll_run_id", input.runId)
      .is("paid_at", null);
    if (unpaidErr) throw new Error(`payroll_items: ${unpaidErr.message}`);
    if ((count ?? 0) > 0) {
      return {
        halt: [
          {
            code: "unpaid_items_remaining",
            message: `${count} payroll item(s) are not yet confirmed disbursed — a run only closes to paid once every employee is paid.`,
            needs: "confirm remaining disbursements (mark_payroll_items_paid)",
          },
        ],
      };
    }

    const { data: transitioned, error } = await ctx.supabase
      .from("payroll_runs")
      .update({ status: "paid" })
      .eq("id", input.runId)
      .eq("company_id", ctx.companyId)
      .eq("status", "completed") // only completed → paid
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`payroll_runs update: ${error.message}`);
    if (!transitioned) {
      return {
        halt: [
          {
            code: "run_not_completed",
            message: `Run ${input.runId} is not in completed status — only a completed run can be closed as paid.`,
          },
        ],
      };
    }
    return { data: { runId: input.runId, status: "paid" } };
  },
});
