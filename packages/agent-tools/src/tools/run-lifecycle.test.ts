import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { executeTool, type ToolContext } from "../tool";
import { approvePayrollRun, cancelPayrollRun, markPayrollRunPaid } from "./run-lifecycle";
import { fakeSupabase, type FakeSupabase } from "../testing/fake-supabase";
import { COMPANY_ID } from "./fixtures";

const RUN_ID = "30000000-0000-0000-0000-000000000001";

function makeCtx(
  tables: Record<string, Record<string, unknown>[]>,
  overrides: Partial<ToolContext> = {},
): { context: ToolContext; fake: FakeSupabase } {
  const fake = fakeSupabase(tables, {
    rpcHandlers: { consume_approval: () => ({ data: true, error: null }) },
  });
  return {
    context: {
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY_ID,
      actorId: "user-1",
      approvalToken: "req-1",
      effects: { enqueuePayrollRun: async () => ({ ok: true }) },
      ...overrides,
    },
    fake,
  };
}

function run(status: string) {
  return { id: RUN_ID, company_id: COMPANY_ID, period_year: 2026, period_month: 7, status };
}

describe("approve_payroll_run", () => {
  it("moves a draft to queued and enqueues it", async () => {
    const calls: string[] = [];
    const tables = { payroll_runs: [run("draft")], payroll_items: [] };
    const { context } = makeCtx(tables, {
      effects: {
        enqueuePayrollRun: async (id) => {
          calls.push(id);
          return { ok: true };
        },
      },
    });
    const result = await executeTool(approvePayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toEqual({ runId: RUN_ID, status: "queued" });
    expect(calls).toEqual([RUN_ID]);
    expect(tables.payroll_runs[0]!.status).toBe("queued");
  });

  it("halts before transitioning when the enqueue capability is missing", async () => {
    const tables = { payroll_runs: [run("draft")], payroll_items: [] };
    const { context } = makeCtx(tables, { effects: {} });
    const result = await executeTool(approvePayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("enqueue_capability_missing");
    expect(tables.payroll_runs[0]!.status).toBe("draft"); // untouched
  });

  it("rolls back to draft when the worker is unreachable", async () => {
    const tables = { payroll_runs: [run("draft")], payroll_items: [] };
    const { context } = makeCtx(tables, {
      effects: { enqueuePayrollRun: async () => ({ ok: false, error: "ECONNREFUSED" }) },
    });
    const result = await executeTool(approvePayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("worker_unreachable");
    expect(tables.payroll_runs[0]!.status).toBe("draft"); // rolled back
  });

  it("halts when the run is not in draft", async () => {
    const tables = { payroll_runs: [run("completed")], payroll_items: [] };
    const { context } = makeCtx(tables);
    const result = await executeTool(approvePayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("run_not_draft");
  });

  it("surfaces the free-plan gate as a structured halt", async () => {
    const tables = { payroll_runs: [run("draft")], payroll_items: [] };
    const { context } = makeCtx(tables);
    (context.supabase as unknown as FakeSupabase) satisfies unknown;
    const fakeWithGate = fakeSupabase(tables, {
      failUpdates: { payroll_runs: "PLAN_GATE_FREE: upgrade required" },
      rpcHandlers: { consume_approval: () => ({ data: true, error: null }) },
    });
    const result = await executeTool(
      approvePayrollRun,
      { runId: RUN_ID },
      { ...context, supabase: fakeWithGate as unknown as SupabaseClient<Database> },
    );
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("plan_gate_free");
  });

  it("refuses without an approval token", async () => {
    const tables = { payroll_runs: [run("draft")], payroll_items: [] };
    const { context } = makeCtx(tables, { approvalToken: undefined });
    const result = await executeTool(approvePayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("denied");
  });
});

describe("cancel_payroll_run", () => {
  it("cancels a queued run", async () => {
    const tables = { payroll_runs: [run("queued")], payroll_items: [] };
    const { context } = makeCtx(tables);
    const result = await executeTool(cancelPayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("ok");
    expect(tables.payroll_runs[0]!.status).toBe("cancelled");
  });

  it("halts on a paid run", async () => {
    const tables = { payroll_runs: [run("paid")], payroll_items: [] };
    const { context } = makeCtx(tables);
    const result = await executeTool(cancelPayrollRun, { runId: RUN_ID }, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("run_not_cancellable");
    expect(tables.payroll_runs[0]!.status).toBe("paid");
  });
});

describe("mark_payroll_run_paid", () => {
  it("closes a completed run when every item is disbursed", async () => {
    const tables = {
      payroll_runs: [run("completed")],
      payroll_items: [
        { id: "i1", payroll_run_id: RUN_ID, paid_at: "2026-07-31T10:00:00Z" },
        { id: "i2", payroll_run_id: RUN_ID, paid_at: "2026-07-31T10:05:00Z" },
      ],
    };
    const { context } = makeCtx(tables);
    const result = await executeTool(markPayrollRunPaid, { runId: RUN_ID }, context);
    expect(result.status).toBe("ok");
    expect(tables.payroll_runs[0]!.status).toBe("paid");
  });

  it("halts while any item is unpaid — the money path re-checks", async () => {
    const tables = {
      payroll_runs: [run("completed")],
      payroll_items: [
        { id: "i1", payroll_run_id: RUN_ID, paid_at: "2026-07-31T10:00:00Z" },
        { id: "i2", payroll_run_id: RUN_ID, paid_at: null },
      ],
    };
    const { context } = makeCtx(tables);
    const result = await executeTool(markPayrollRunPaid, { runId: RUN_ID }, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("unpaid_items_remaining");
    expect(tables.payroll_runs[0]!.status).toBe("completed");
  });

  it("halts when the run is not completed", async () => {
    const tables = { payroll_runs: [run("queued")], payroll_items: [] };
    const { context } = makeCtx(tables);
    const result = await executeTool(markPayrollRunPaid, { runId: RUN_ID }, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("run_not_completed");
  });
});
