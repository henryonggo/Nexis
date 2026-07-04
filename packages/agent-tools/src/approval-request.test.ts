import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { createApprovalRequest } from "./approval-request";
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
