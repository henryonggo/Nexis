import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import {
  createApprovalRequest,
  findConsumableApprovalRequest,
  findPendingApprovalRequest,
} from "./approval-request";
import { approvalPayloadHash } from "./approval";
import { fakeSupabase } from "./testing/fake-supabase";

const COMPANY = "10000000-0000-0000-0000-000000000001";

describe("createApprovalRequest", () => {
  it("inserts a pending request whose hash executeTool will verify", async () => {
    const fake = fakeSupabase({});
    const payload = { year: 2026, month: 7 };
    const result = await createApprovalRequest({
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY,
      toolName: "create_draft_payroll_run",
      payload,
      summary: "Buat draf payroll Juli 2026 (6 karyawan)",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = fake.inserts.approval_requests![0]!;
    expect(row).toMatchObject({
      company_id: COMPANY,
      tool_name: "create_draft_payroll_run",
      payload: { year: 2026, month: 7 },
      summary: "Buat draf payroll Juli 2026 (6 karyawan)",
    });
    // The stored hash is exactly what the executor recomputes at consume time.
    expect(row.payload_hash).toBe(
      await approvalPayloadHash("create_draft_payroll_run", payload),
    );
    expect(result.requestId).toBe(row.id);
  });

  it("surfaces an insert failure (e.g. RLS denial) as a structured error", async () => {
    const fake = fakeSupabase({}, { failInserts: { approval_requests: "RLS: denied" } });
    const result = await createApprovalRequest({
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY,
      toolName: "create_draft_payroll_run",
      payload: {},
      summary: "x",
    });
    expect(result).toEqual({ ok: false, error: "RLS: denied" });
  });
});

describe("findConsumableApprovalRequest", () => {
  it("finds the oldest APPROVED row matching company/tool/hash", async () => {
    const hash = await approvalPayloadHash("create_draft_payroll_run", { year: 2026, month: 7 });
    const fake = fakeSupabase({
      approval_requests: [
        {
          id: "req-old",
          company_id: COMPANY,
          tool_name: "create_draft_payroll_run",
          payload_hash: hash,
          status: "approved",
          created_at: "2026-07-01T00:00:00Z",
        },
        {
          id: "req-new",
          company_id: COMPANY,
          tool_name: "create_draft_payroll_run",
          payload_hash: hash,
          status: "approved",
          created_at: "2026-07-02T00:00:00Z",
        },
      ],
    });
    const result = await findConsumableApprovalRequest({
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY,
      toolName: "create_draft_payroll_run",
      payloadHash: hash,
    });
    expect(result).toEqual({ requestId: "req-old" });
  });

  it("ignores rows with a different hash, and rows not in `approved` status", async () => {
    const hash = await approvalPayloadHash("create_draft_payroll_run", { year: 2026, month: 7 });
    const otherHash = await approvalPayloadHash("create_draft_payroll_run", {
      year: 2026,
      month: 8,
    });
    const fake = fakeSupabase({
      approval_requests: [
        {
          id: "req-pending",
          company_id: COMPANY,
          tool_name: "create_draft_payroll_run",
          payload_hash: hash,
          status: "pending",
          created_at: "2026-07-01T00:00:00Z",
        },
        {
          id: "req-consumed",
          company_id: COMPANY,
          tool_name: "create_draft_payroll_run",
          payload_hash: hash,
          status: "consumed",
          created_at: "2026-07-01T00:00:00Z",
        },
        {
          id: "req-other-hash",
          company_id: COMPANY,
          tool_name: "create_draft_payroll_run",
          payload_hash: otherHash,
          status: "approved",
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const result = await findConsumableApprovalRequest({
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY,
      toolName: "create_draft_payroll_run",
      payloadHash: hash,
    });
    expect(result).toBeNull();
  });
});

describe("findPendingApprovalRequest", () => {
  it("finds a `pending` row matching company/tool/hash, ignoring approved/consumed ones", async () => {
    const hash = await approvalPayloadHash("create_draft_payroll_run", { year: 2026, month: 7 });
    const fake = fakeSupabase({
      approval_requests: [
        {
          id: "req-pending",
          company_id: COMPANY,
          tool_name: "create_draft_payroll_run",
          payload_hash: hash,
          status: "pending",
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const result = await findPendingApprovalRequest({
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY,
      toolName: "create_draft_payroll_run",
      payloadHash: hash,
    });
    expect(result).toEqual({ requestId: "req-pending" });
  });

  it("returns null when no pending row matches", async () => {
    const hash = await approvalPayloadHash("create_draft_payroll_run", { year: 2026, month: 7 });
    const fake = fakeSupabase({ approval_requests: [] });
    const result = await findPendingApprovalRequest({
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY,
      toolName: "create_draft_payroll_run",
      payloadHash: hash,
    });
    expect(result).toBeNull();
  });
});
