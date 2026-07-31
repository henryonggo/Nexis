import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { defineTool, type ToolContext } from "@nexis/agent-tools";
import { runPayrollCycle, type ModelClient, type ModelResponse } from "./driver";
import { toAnthropicTools } from "./tool-adapter";

/**
 * Minimal DB stub: audit inserts, approval-request insert + eq-filtered
 * select (for the payload-hash finders), consume RPC. Inserted rows default
 * to `status: "pending"`, matching the real table's column default.
 */
function fakeDb(
  opts: {
    consumeResult?: boolean;
    agentCyclesInsertError?: string;
    auditLogsInsertError?: string;
  } = {},
) {
  const inserts: Record<string, Record<string, unknown>[]> = {};
  const db = {
    inserts,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          const stored = {
            id: `fake-${table}-${(inserts[table]?.length ?? 0) + 1}`,
            status: "pending",
            ...row,
          };
          (inserts[table] ??= []).push(stored);
          const error =
            table === "agent_cycles" && opts.agentCyclesInsertError
              ? { message: opts.agentCyclesInsertError }
              : table === "audit_logs" && opts.auditLogsInsertError
                ? { message: opts.auditLogsInsertError }
                : null;
          return {
            then: (
              onfulfilled?: (v: { error: typeof error }) => unknown,
              onrejected?: (e: unknown) => unknown,
            ) => Promise.resolve({ error }).then(onfulfilled, onrejected),
            select: () => ({
              single: () => Promise.resolve({ data: stored, error: null }),
            }),
          };
        },
        select(_columns?: string) {
          let rows = [...(inserts[table] ?? [])];
          const builder = {
            eq(column: string, value: unknown) {
              rows = rows.filter((r) => r[column] === value);
              return builder;
            },
            // Insert order == created_at order in this stub — no-op.
            order() {
              return builder;
            },
            limit(n: number) {
              rows = rows.slice(0, n);
              return builder;
            },
            maybeSingle() {
              return Promise.resolve({ data: rows[0] ?? null, error: null });
            },
          };
          return builder;
        },
      };
    },
    rpc: () => Promise.resolve({ data: opts.consumeResult ?? false, error: null }),
  };
  return db;
}

/** Scripted model: returns the queued responses in order. */
function fakeModel(script: ModelResponse[]): ModelClient & { requests: Record<string, unknown>[] } {
  const requests: Record<string, unknown>[] = [];
  return {
    requests,
    beta: {
      messages: {
        create(params: Record<string, unknown>) {
          // Deep-copy: the driver mutates its messages array after the call.
          requests.push(JSON.parse(JSON.stringify(params)));
          const next = script.shift();
          if (!next) throw new Error("script exhausted");
          return Promise.resolve(next);
        },
      },
    },
  };
}

const readTool = defineTool({
  name: "read_numbers",
  description: "read-only test tool",
  requiresApproval: false,
  input: z.object({ year: z.number().int() }),
  run: async (input) => ({ data: { gross: 15_000_000, year: input.year } }),
});

const haltTool = defineTool({
  name: "halting_tool",
  description: "always halts",
  requiresApproval: false,
  input: z.object({}),
  run: async () => ({
    halt: [{ code: "missing_tax_profile", message: "E-2 has no tax profile." }],
  }),
});

const mutateTool = defineTool({
  name: "create_draft",
  description: "test mutation",
  requiresApproval: true,
  input: z.object({ year: z.number().int(), month: z.number().int() }),
  run: async () => ({ data: { runId: "run-1" } }),
});

function ctxWith(db: ReturnType<typeof fakeDb>): Omit<ToolContext, "approvalToken"> {
  return {
    supabase: db as unknown as SupabaseClient<Database>,
    companyId: "10000000-0000-0000-0000-000000000001",
    actorId: "user-1",
  };
}

describe("runPayrollCycle", () => {
  it("runs a read tool and completes on end_turn", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Menghitung..." },
          { type: "tool_use", id: "tu_1", name: "read_numbers", input: { year: 2026 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Total bruto Rp15.000.000." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("Total bruto Rp15.000.000.");
    expect(result.auditGaps).toEqual([]);
    // Second request carried the tool result back in ONE user message.
    const secondMessages = client.requests[1]!.messages as { role: string; content: unknown }[];
    const lastUser = secondMessages[secondMessages.length - 1]!;
    expect(lastUser.role).toBe("user");
    const blocks = lastUser.content as { type: string; content: string }[];
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0]!.content)).toMatchObject({
      status: "ok",
      data: { gross: 15_000_000 },
    });
    // Fable 5: no thinking param; fallbacks on by default.
    expect(client.requests[0]).not.toHaveProperty("thinking");
    expect(client.requests[0]!.fallbacks).toEqual([{ model: "claude-opus-4-8" }]);
  });

  it("opens an approval request on a denied mutation and pauses", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "create_draft", input: { year: 2026, month: 7 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Menunggu persetujuan pemilik." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Buat draf payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.pendingApprovals).toHaveLength(1);
    expect(result.pendingApprovals[0]).toMatchObject({ tool: "create_draft" });
    // The approval_requests row stores the exact payload + a hash.
    const row = db.inserts.approval_requests![0]!;
    expect(row).toMatchObject({
      tool_name: "create_draft",
      payload: { year: 2026, month: 7 },
    });
    expect(String(row.payload_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resumes with an approval token and executes the mutation", async () => {
    const db = fakeDb({ consumeResult: true });
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "create_draft", input: { year: 2026, month: 7 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Draf payroll dibuat." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Lanjutkan siklus payroll Juli 2026.",
      approvalTokens: { create_draft: "req-1" },
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("completed");
    expect(result.pendingApprovals).toHaveLength(0);
    const okEvent = result.events.find(
      (e) => e.type === "tool_result" && e.tool === "create_draft",
    );
    expect(okEvent).toMatchObject({ status: "ok" });
  });

  // FIX (NEXT-3, docs/pivot/ROADMAP.md): approvals resolve by payload hash,
  // not by a Record<toolName, requestId> slot — so two same-named proposals
  // each consume their OWN approved request, regardless of the order the
  // model re-issues the calls in on resume.
  function proposeTwoDrafts() {
    const db = fakeDb({ consumeResult: true });
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "create_draft", input: { year: 2026, month: 7 } },
          { type: "tool_use", id: "tu_2", name: "create_draft", input: { year: 2026, month: 8 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Menunggu persetujuan pemilik untuk dua periode." }],
      },
    ]);
    return { db, client };
  }

  async function expectDoublePropose(db: ReturnType<typeof fakeDb>, client: ModelClient) {
    const proposeResult = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Buat draf payroll Juli dan Agustus 2026.",
      tools: [readTool, mutateTool],
    });
    expect(proposeResult.status).toBe("awaiting_approval");
    // Both proposals get their own row — no clobbering while OPENING requests.
    expect(proposeResult.pendingApprovals).toHaveLength(2);
    const opened = db.inserts.approval_requests!;
    expect(opened).toHaveLength(2);
    expect(opened[0]).toMatchObject({ tool_name: "create_draft", payload: { year: 2026, month: 7 } });
    expect(opened[1]).toMatchObject({ tool_name: "create_draft", payload: { year: 2026, month: 8 } });
    return opened;
  }

  it("same-named double proposal: owner approves both, resume consumes each request exactly once", async () => {
    const { db, client } = proposeTwoDrafts();
    const opened = await expectDoublePropose(db, client);

    // Owner approves both on /approvals.
    opened[0]!.status = "approved";
    opened[1]!.status = "approved";

    const client2 = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_3", name: "create_draft", input: { year: 2026, month: 7 } },
          { type: "tool_use", id: "tu_4", name: "create_draft", input: { year: 2026, month: 8 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Draf Juli dan Agustus dibuat." }],
      },
    ]);

    const resumeResult = await runPayrollCycle({
      client: client2,
      toolContext: ctxWith(db),
      instruction: "Lanjutkan siklus payroll.",
      // No legacy approvalTokens hint needed — hash lookup finds both.
      tools: [readTool, mutateTool],
    });

    expect(resumeResult.status).toBe("completed");
    expect(resumeResult.pendingApprovals).toHaveLength(0);
    const okResults = resumeResult.events.filter(
      (e) => e.type === "tool_result" && e.tool === "create_draft" && e.status === "ok",
    );
    expect(okResults).toHaveLength(2);
    // No duplicate opened — the two approved rows from propose are all there is.
    expect(db.inserts.approval_requests).toHaveLength(2);
  });

  it("same-named double proposal, calls re-issued in SWAPPED order: each call still finds its own request", async () => {
    const { db, client } = proposeTwoDrafts();
    const opened = await expectDoublePropose(db, client);
    opened[0]!.status = "approved";
    opened[1]!.status = "approved";

    // August's call comes first this time, July's second.
    const client2 = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_3", name: "create_draft", input: { year: 2026, month: 8 } },
          { type: "tool_use", id: "tu_4", name: "create_draft", input: { year: 2026, month: 7 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Draf Agustus dan Juli dibuat." }],
      },
    ]);

    const resumeResult = await runPayrollCycle({
      client: client2,
      toolContext: ctxWith(db),
      instruction: "Lanjutkan siklus payroll.",
      tools: [readTool, mutateTool],
    });

    expect(resumeResult.status).toBe("completed");
    expect(resumeResult.pendingApprovals).toHaveLength(0);
    const okResults = resumeResult.events.filter(
      (e) => e.type === "tool_result" && e.tool === "create_draft" && e.status === "ok",
    );
    expect(okResults).toHaveLength(2);
    expect(db.inserts.approval_requests).toHaveLength(2);
  });

  it("same-named double proposal, one still pending on resume: it is denied again, no duplicate row", async () => {
    const { db, client } = proposeTwoDrafts();
    const opened = await expectDoublePropose(db, client);

    // Owner approves only August; July is left pending.
    opened[1]!.status = "approved";

    const client2 = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_3", name: "create_draft", input: { year: 2026, month: 7 } },
          { type: "tool_use", id: "tu_4", name: "create_draft", input: { year: 2026, month: 8 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Agustus dibuat; Juli masih menunggu." }],
      },
    ]);

    const resumeResult = await runPayrollCycle({
      client: client2,
      toolContext: ctxWith(db),
      instruction: "Lanjutkan siklus payroll.",
      tools: [readTool, mutateTool],
    });

    expect(resumeResult.status).toBe("awaiting_approval");
    const augustOk = resumeResult.events.find(
      (e) => e.type === "tool_result" && e.tool === "create_draft" && e.status === "ok",
    );
    expect(augustOk).toBeDefined();
    // July was denied again but reused its ORIGINAL pending row.
    expect(resumeResult.pendingApprovals).toHaveLength(1);
    expect(resumeResult.pendingApprovals[0]!.requestId).toBe(opened[0]!.id);
    expect(db.inserts.approval_requests).toHaveLength(2);
  });

  it("collects halts and reports a halted cycle", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "halting_tool", input: {} }],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Ada data yang belum lengkap." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll.",
      tools: [haltTool],
    });

    expect(result.status).toBe("halted");
    expect(result.halts).toEqual([
      { code: "missing_tax_profile", message: "E-2 has no tax profile." },
    ]);
  });

  it("surfaces a refusal as a terminal status", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "refusal",
        content: [],
        stop_details: { category: null, explanation: "declined" },
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll.",
      tools: [readTool],
    });

    expect(result.status).toBe("refusal");
    expect(result.events).toContainEqual({ type: "refusal", detail: "declined" });
  });

  it("stops after maxTurns instead of looping forever", async () => {
    const db = fakeDb();
    const loopResponse: ModelResponse = {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_x", name: "read_numbers", input: { year: 2026 } }],
    };
    const client = fakeModel([loopResponse, { ...loopResponse, content: [...loopResponse.content] }]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Loop.",
      tools: [readTool],
      maxTurns: 2,
    });

    expect(result.status).toBe("max_turns");
  });

  it("records one agent_cycles row for a completed cycle", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "read_numbers", input: { year: 2026 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Total bruto Rp15.000.000." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("completed");
    expect(result.recorded).toBe(true);
    expect(result.auditGaps).toEqual([]);
    expect(db.inserts.agent_cycles).toHaveLength(1);
    expect(db.inserts.agent_cycles![0]).toMatchObject({
      company_id: "10000000-0000-0000-0000-000000000001",
      instruction: "Jalankan siklus payroll Juli 2026.",
      status: "completed",
      pending_request_ids: [],
    });
  });

  it("records pending_request_ids for an awaiting_approval cycle", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "create_draft", input: { year: 2026, month: 7 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Menunggu persetujuan pemilik." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Buat draf payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.recorded).toBe(true);
    expect(db.inserts.agent_cycles).toHaveLength(1);
    const row = db.inserts.agent_cycles![0]!;
    expect(row.status).toBe("awaiting_approval");
    expect(row.pending_request_ids).toEqual([result.pendingApprovals[0]!.requestId]);
  });

  it("swallows an agent_cycles insert failure: recorded false, cycle result otherwise unchanged", async () => {
    const db = fakeDb({ agentCyclesInsertError: "relation locked" });
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "read_numbers", input: { year: 2026 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Total bruto Rp15.000.000." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("Total bruto Rp15.000.000.");
    expect(result.recorded).toBe(false);
    expect(result.events).toContainEqual({
      type: "error",
      message: "agent_cycles insert failed: relation locked",
    });
    expect(result.auditGaps).toEqual([]);
  });

  it("surfaces a per-call audit_logs insert failure via auditGaps, without changing cycle status", async () => {
    const db = fakeDb({ auditLogsInsertError: "RLS denied insert" });
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "read_numbers", input: { year: 2026 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Total bruto Rp15.000.000." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    // The tool call itself still succeeded — only its audit insert failed.
    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("Total bruto Rp15.000.000.");
    expect(result.auditGaps).toEqual([
      { tool: "read_numbers", error: "RLS denied insert" },
    ]);
    const toolResultEvent = result.events.find(
      (e) => e.type === "tool_result" && e.tool === "read_numbers",
    );
    expect(toolResultEvent).toMatchObject({ status: "ok", auditRecorded: false });
  });

  it("yields an empty auditGaps when every tool call's audit insert succeeds", async () => {
    const db = fakeDb();
    const client = fakeModel([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "read_numbers", input: { year: 2026 } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Total bruto Rp15.000.000." }],
      },
    ]);

    const result = await runPayrollCycle({
      client,
      toolContext: ctxWith(db),
      instruction: "Jalankan siklus payroll Juli 2026.",
      tools: [readTool, mutateTool],
    });

    expect(result.status).toBe("completed");
    expect(result.auditGaps).toEqual([]);
    const toolResultEvent = result.events.find(
      (e) => e.type === "tool_result" && e.tool === "read_numbers",
    );
    expect(toolResultEvent).toMatchObject({ status: "ok", auditRecorded: true });
  });
});

describe("toAnthropicTools", () => {
  it("converts zod schemas to JSON schema and flags approval tools", () => {
    const defs = toAnthropicTools([readTool, mutateTool]);
    expect(defs[0]).toMatchObject({ name: "read_numbers" });
    expect(defs[0]!.input_schema).toMatchObject({
      type: "object",
      properties: { year: { type: "integer" } },
      required: ["year"],
    });
    expect(defs[0]!.input_schema).not.toHaveProperty("$schema");
    expect(defs[1]!.description).toMatch(/approval request/i);
  });
});
