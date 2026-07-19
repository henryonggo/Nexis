import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { executeTool, type ToolContext } from "../tool";
import { computePayrollRun } from "./compute-payroll-run";
import { fakeSupabase } from "../testing/fake-supabase";
import { baseTables, COMPANY_ID, EMP_BUDI, EMP_SITI } from "./fixtures";

function makeCtx(tables = baseTables()): ToolContext {
  return {
    supabase: fakeSupabase(tables) as unknown as SupabaseClient<Database>,
    companyId: COMPANY_ID,
    actorId: "user-1",
  };
}

const PERIOD = { year: 2026, month: 7 };

/** Complete Siti's data so the whole active roster (Budi + Siti) computes. */
function completedTables() {
  const tables = baseTables();
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
  return tables;
}

describe("compute_payroll_run", () => {
  it("computes every active employee and sums integer-rupiah totals", async () => {
    const result = await executeTool(computePayrollRun, PERIOD, makeCtx(completedTables()));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.lines.map((l) => l.employeeId)).toEqual([EMP_BUDI, EMP_SITI]);

    // Budi: gross 10,000,000 → pph21 75,000, net 9,525,000 (see pph21 tests).
    // Siti: gross 5,000,000 → TER band A/0 bps → pph21 0; kes 50,000 +
    // jht 100,000 + jp 50,000 → net 4,800,000.
    const siti = result.data.lines[1]!;
    expect(siti.result.pph21).toBe(0);
    expect(siti.result.netPay).toBe(4_800_000);

    expect(result.data.totals).toEqual({
      gross: 15_000_000,
      bpjsEmployee: 400_000 + 200_000, // Budi 400k, Siti 200k (kes+jht+jp)
      bpjsEmployer:
        // Budi: kes 400k + jht 370k + jp 200k + jkk(low 54bps) 54k + jkm 30k
        // Siti: kes 200k + jht 185k + jp 100k + jkk 27k + jkm 15k
        1_054_000 + 527_000,
      pph21: 75_000,
      net: 9_525_000 + 4_800_000,
      nonTaxableEarnings: 0,
    });
    for (const value of Object.values(result.data.totals)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("halts with ALL reasons when any employee is incomplete — no partial totals", async () => {
    // Default fixtures: Siti has no compensation and no tax profile.
    const result = await executeTool(computePayrollRun, PERIOD, makeCtx());
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain("missing_compensation");
    expect(codes).toContain("missing_tax_profile");
    // Budi's clean line must NOT leak out as a partial answer.
    expect("data" in result).toBe(false);
  });

  it("halts on an empty active roster", async () => {
    const tables = baseTables();
    tables.employees = tables.employees.map((e) => ({ ...e, status: "inactive" }));
    const result = await executeTool(computePayrollRun, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("empty_roster");
  });

  it("halts when rate reference tables have no rows in force", async () => {
    const tables = completedTables();
    tables.bpjs_config = [];
    const result = await executeTool(computePayrollRun, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons[0]!.code).toBe("missing_rate_config");
  });

  // dry-run pre-flight 2026-07-19 (docs/pivot/dry-run-preflight-2026-07.md):
  // staging's 7th active employee's only compensation row is effective
  // mid-period (hired 2026-07-17). Paying a full month would be a silently
  // wrong number (pivot ground rule 1) — the run must halt, not compute.
  it("halts on a mid-period compensation change — no line leaks out", async () => {
    const tables = completedTables();
    const EMP_HIRE = "20000000-0000-0000-0000-000000000007";
    tables.employees.push({
      id: EMP_HIRE,
      company_id: COMPANY_ID,
      employee_no: "BW-007",
      full_name: "Rina Marlina",
      status: "active",
      join_date: "2026-07-17",
    });
    tables.compensation.push({
      company_id: COMPANY_ID,
      employee_id: EMP_HIRE,
      base_salary: 5_000_000,
      pay_frequency: "monthly",
      fixed_allowances: 0,
      bpjs_kes_enrolled: true,
      jht_enrolled: true,
      jp_enrolled: true,
      effective_from: "2026-07-17",
    });
    tables.tax_profile.push({
      company_id: COMPANY_ID,
      employee_id: EMP_HIRE,
      ptkp_status: "TK/0",
      has_npwp: true,
    });
    const result = await executeTool(computePayrollRun, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    if (result.status !== "halt") return;
    expect(result.reasons.map((r) => r.code)).toEqual(["mid_period_compensation"]);
    expect(result.reasons[0]!.message).toContain("Rina Marlina");
    expect(result.reasons[0]!.message).toContain("2026-07-17");
    // Budi + Siti's clean lines must NOT leak out as a partial answer.
    expect("data" in result).toBe(false);
  });
});
