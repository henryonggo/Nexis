import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { executeTool, type ToolContext } from "../tool";
import { createDraftPayrollRun } from "./create-draft-payroll-run";
import { fakeSupabase, type FakeSupabase } from "../testing/fake-supabase";
import { baseTables, COMPANY_ID, EMP_BUDI, EMP_SITI } from "./fixtures";

const PERIOD = { year: 2026, month: 7 };

/** Roster fully computable AND banked (the mutation's extra G7 gate). */
function readyTables() {
  const tables = baseTables() as ReturnType<typeof baseTables> & {
    bank_accounts: Record<string, unknown>[];
    payroll_runs: Record<string, unknown>[];
  };
  tables.compensation.push({
    company_id: COMPANY_ID,
    employee_id: EMP_SITI,
    base_salary: 5_000_000,
    pay_frequency: "monthly",
    fixed_allowances: 0,
    bpjs_kes_enrolled: true,
    jht_enrolled: true,
    jp_enrolled: true,
    effective_from: "2025-02-01",
  });
  tables.tax_profile.push({
    company_id: COMPANY_ID,
    employee_id: EMP_SITI,
    ptkp_status: "TK/0",
    has_npwp: true,
  });
  tables.bank_accounts = [
    { company_id: COMPANY_ID, employee_id: EMP_BUDI, account_no: "111", is_primary: true },
    { company_id: COMPANY_ID, employee_id: EMP_SITI, account_no: "222", is_primary: true },
  ];
  tables.payroll_runs = [];
  return tables;
}

function makeCtx(tables: Record<string, Record<string, unknown>[]>): {
  context: ToolContext;
  fake: FakeSupabase;
} {
  const fake = fakeSupabase(tables, {
    rpcHandlers: { consume_approval: () => ({ data: true, error: null }) },
  });
  return {
    context: {
      supabase: fake as unknown as SupabaseClient<Database>,
      companyId: COMPANY_ID,
      actorId: "user-1",
      approvalToken: "req-1",
    },
    fake,
  };
}

describe("create_draft_payroll_run", () => {
  it("refuses to run without an approval token", async () => {
    const { context } = makeCtx(readyTables());
    const result = await executeTool(
      createDraftPayrollRun,
      PERIOD,
      { ...context, approvalToken: undefined },
    );
    expect(result.status).toBe("denied");
  });

  it("inserts a draft run with snapshot and totals once approved", async () => {
    const { context, fake } = makeCtx(readyTables());
    const result = await executeTool(createDraftPayrollRun, PERIOD, context);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.reactivated).toBe(false);
    expect(result.data.employeeCount).toBe(2);
    expect(result.data.totals.gross).toBe(15_000_000);

    const inserted = fake.inserts.payroll_runs?.[0];
    expect(inserted).toMatchObject({
      company_id: COMPANY_ID,
      period_year: 2026,
      period_month: 7,
      status: "draft",
      total_gross: 15_000_000,
      total_pph21: 75_000,
      total_net: 14_325_000,
    });
    const snapshot = inserted!.config_snapshot as {
      effectiveDate: string;
      runType: string;
      config: Record<string, unknown>;
    };
    expect(snapshot.effectiveDate).toBe("2026-07-01");
    expect(snapshot.runType).toBe("monthly");
    expect(snapshot.config.bpjsKesEmployeeBps).toBe(100);
    expect(snapshot.config.jpCap).toBe(10_547_400);
  });

  it("halts when an active run already holds the period", async () => {
    const tables = readyTables();
    tables.payroll_runs.push({
      id: "run-live",
      company_id: COMPANY_ID,
      period_year: 2026,
      period_month: 7,
      status: "draft",
    });
    const { context } = makeCtx(tables);
    const result = await executeTool(createDraftPayrollRun, PERIOD, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("run_already_exists");
  });

  it("reactivates a cancelled run in place instead of inserting", async () => {
    const tables = readyTables();
    tables.payroll_runs.push({
      id: "run-old",
      company_id: COMPANY_ID,
      period_year: 2026,
      period_month: 7,
      status: "cancelled",
    });
    const { context, fake } = makeCtx(tables);
    const result = await executeTool(createDraftPayrollRun, PERIOD, context);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toMatchObject({ runId: "run-old", reactivated: true });
    expect(fake.inserts.payroll_runs ?? []).toHaveLength(0);
    expect(fake.updates.payroll_runs).toHaveLength(1);
    expect(fake.updates.payroll_runs![0]).toMatchObject({
      status: "draft",
      completed_at: null,
    });
  });

  it("halts when an employee has no bank account (G7 parity)", async () => {
    const tables = readyTables();
    tables.bank_accounts = tables.bank_accounts.filter(
      (b) => b.employee_id !== EMP_SITI,
    );
    const { context, fake } = makeCtx(tables);
    const result = await executeTool(createDraftPayrollRun, PERIOD, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons.map((r) => r.code)).toEqual(["missing_bank_account"]);
    expect(fake.inserts.payroll_runs ?? []).toHaveLength(0);
  });

  it("halts (not partial-drafts) when the statutory compute halts", async () => {
    const tables = readyTables();
    tables.tax_profile = tables.tax_profile.filter(
      (t) => t.employee_id !== EMP_SITI,
    );
    const { context, fake } = makeCtx(tables);
    const result = await executeTool(createDraftPayrollRun, PERIOD, context);
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons.map((r) => r.code)).toContain("missing_tax_profile");
    expect(fake.inserts.payroll_runs ?? []).toHaveLength(0);
  });
});
