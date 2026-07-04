import { describe, expect, it } from "vitest";
import { approvalPayloadHash, canonicalJson } from "./approval";

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
  });

  it("drops undefined values like JSON.stringify does", () => {
    expect(canonicalJson({ a: 1, gone: undefined })).toBe('{"a":1}');
  });
});

describe("approvalPayloadHash", () => {
  it("is deterministic across key order", async () => {
    const a = await approvalPayloadHash("approve_run", { runId: "r1", year: 2026 });
    const b = await approvalPayloadHash("approve_run", { year: 2026, runId: "r1" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the payload changes", async () => {
    const a = await approvalPayloadHash("approve_run", { runId: "r1" });
    const b = await approvalPayloadHash("approve_run", { runId: "r2" });
    expect(a).not.toBe(b);
  });

  it("changes when the tool name changes (token can't be replayed cross-tool)", async () => {
    const a = await approvalPayloadHash("approve_run", { runId: "r1" });
    const b = await approvalPayloadHash("cancel_run", { runId: "r1" });
    expect(a).not.toBe(b);
  });
});
