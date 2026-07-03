import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { defineTool, executeTool, type ToolContext } from "./tool";
import { fakeSupabase } from "./testing/fake-supabase";

function ctx(
  overrides: Partial<ToolContext> = {},
  fakeOpts: Parameters<typeof fakeSupabase>[1] = {},
) {
  const fake = fakeSupabase({}, fakeOpts);
  return {
    context: {
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: "company-1",
      actorId: "user-1",
      ...overrides,
    } satisfies ToolContext,
    fake,
  };
}

const echoTool = defineTool({
  name: "echo",
  description: "test tool",
  requiresApproval: false,
  input: z.object({ value: z.number().int() }),
  run: async (input) => ({ data: { doubled: input.value * 2 } }),
});

const mutateTool = defineTool({
  name: "mutate",
  description: "test mutation",
  requiresApproval: true,
  input: z.object({}),
  run: async () => ({ data: { done: true } }),
});

describe("executeTool", () => {
  it("runs a read-only tool and records an audit entry", async () => {
    const { context, fake } = ctx();
    const result = await executeTool(echoTool, { value: 21 }, context);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data.doubled).toBe(42);
    expect(result.audit.action).toBe("agent_tool.echo");
    expect(result.audit.recorded).toBe(true);
    expect(fake.inserts.audit_logs).toHaveLength(1);
    expect(fake.inserts.audit_logs?.[0]).toMatchObject({
      action: "agent_tool.echo",
      entity: "agent_tools",
      company_id: "company-1",
      actor_id: "user-1",
    });
  });

  it("rejects invalid input with a structured error (still audited)", async () => {
    const { context, fake } = ctx();
    const result = await executeTool(echoTool, { value: "NaN" }, context);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toMatch(/value/);
    expect(fake.inserts.audit_logs).toHaveLength(1);
  });

  it("denies a requires_approval mutation without a token", async () => {
    const { context } = ctx();
    const result = await executeTool(mutateTool, {}, context);
    expect(result.status).toBe("denied");
    if (result.status === "denied") expect(result.reason).toMatch(/approval token/);
  });

  it("runs a requires_approval mutation when consume_approval accepts the token", async () => {
    const { context, fake } = ctx(
      { approvalToken: "req-1" },
      { rpcHandlers: { consume_approval: () => ({ data: true, error: null }) } },
    );
    const result = await executeTool(mutateTool, {}, context);
    expect(result.status).toBe("ok");
    // The RPC got the token, tool name, and a real payload hash.
    expect(fake.rpcCalls).toHaveLength(1);
    const call = fake.rpcCalls[0]!;
    expect(call.fn).toBe("consume_approval");
    expect(call.args.request_id).toBe("req-1");
    expect(call.args.tool_name).toBe("mutate");
    expect(String(call.args.payload_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("denies a mutation when consume_approval rejects the token", async () => {
    const { context } = ctx(
      { approvalToken: "req-expired" },
      { rpcHandlers: { consume_approval: () => ({ data: false, error: null }) } },
    );
    const result = await executeTool(mutateTool, {}, context);
    expect(result.status).toBe("denied");
    if (result.status === "denied") expect(result.reason).toMatch(/rejected/);
  });

  it("denies a mutation when the verification RPC errors", async () => {
    const { context } = ctx(
      { approvalToken: "req-1" },
      {
        rpcHandlers: {
          consume_approval: () => ({ data: null, error: { message: "function does not exist" } }),
        },
      },
    );
    const result = await executeTool(mutateTool, {}, context);
    expect(result.status).toBe("denied");
    if (result.status === "denied") expect(result.reason).toMatch(/verification failed/);
  });

  it("converts a thrown error into a structured error result", async () => {
    const boom = defineTool({
      name: "boom",
      description: "throws",
      requiresApproval: false,
      input: z.object({}),
      run: async () => {
        throw new Error("db unreachable");
      },
    });
    const { context } = ctx();
    const result = await executeTool(boom, {}, context);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toBe("db unreachable");
  });

  it("does not fail the call when the audit insert is denied", async () => {
    const fake = fakeSupabase({}, { failInserts: { audit_logs: "RLS: insert denied" } });
    const context: ToolContext = {
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: "company-1",
      actorId: "user-1",
    };
    const result = await executeTool(echoTool, { value: 1 }, context);
    expect(result.status).toBe("ok");
    expect(result.audit.recorded).toBe(false);
    expect(result.audit.recordError).toMatch(/RLS/);
  });
});
