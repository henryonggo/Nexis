import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { defineTool, type ToolContext } from "@nexis/agent-tools";
import { runPayrollCycle, type ModelClient, type ModelResponse } from "./driver";
import { toAnthropicTools } from "./tool-adapter";

/** Minimal DB stub: audit inserts, approval-request insert, consume RPC. */
function fakeDb(opts: { consumeResult?: boolean } = {}) {
  const inserts: Record<string, Record<string, unknown>[]> = {};
  const db = {
    inserts,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          const stored = { id: `fake-${table}-${(inserts[table]?.length ?? 0) + 1}`, ...row };
          (inserts[table] ??= []).push(stored);
          return {
            then: (
              onfulfilled?: (v: { error: null }) => unknown,
              onrejected?: (e: unknown) => unknown,
            ) => Promise.resolve({ error: null }).then(onfulfilled, onrejected),
            select: () => ({
              single: () => Promise.resolve({ data: stored, error: null }),
            }),
          };
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

  // CONSTRAINT (NEXT-2, docs/pivot/ROADMAP.md): `approvalTokens` is a
  // Record<toolName, requestId> — ONE slot per tool name. When the model
  // proposes the SAME mutating tool twice in one turn (two different runIds,
  // say), both proposals open their own approval_requests row, but a resume
  // call can only carry ONE of their two tokens under the shared
  // "create_draft" key. This test asserts CURRENT behavior — it does not fix
  // it; the fix (e.g. keying tokens by request id, or by a tool-call index)
  // is a separate decision for the orchestrator to make.
  it("same-named double proposal: two approval requests open, but a resume can only carry one token per tool name", async () => {
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

    // Suppose the owner approves BOTH. A resume call still has only one
    // "create_draft" key to carry a token in — pass the July request's id.
    const julyRequestId = opened[0]!.id as string;
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
        content: [{ type: "text", text: "Draf Juli dibuat; Agustus masih menunggu." }],
      },
    ]);

    const resumeResult = await runPayrollCycle({
      client: client2,
      toolContext: ctxWith(db),
      instruction: "Lanjutkan siklus payroll.",
      approvalTokens: { create_draft: julyRequestId },
      tools: [readTool, mutateTool],
    });

    // July's call consumed the one available token and executed.
    const julyOk = resumeResult.events.find(
      (e) => e.type === "tool_result" && e.tool === "create_draft" && e.status === "ok",
    );
    expect(julyOk).toBeDefined();

    // August's call ran with NO token — the single "create_draft" slot was
    // already spent on July — so it is denied again and the driver opens a
    // THIRD approval_requests row, even though the owner already approved
    // August's original (second) request. That already-approved request is
    // never consumed; a duplicate is created instead.
    expect(resumeResult.status).toBe("awaiting_approval");
    expect(resumeResult.pendingApprovals).toHaveLength(1);
    expect(resumeResult.pendingApprovals[0]).toMatchObject({ tool: "create_draft" });
    expect(db.inserts.approval_requests).toHaveLength(3);
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
