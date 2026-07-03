import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { executeTool, type ToolContext } from "../tool";
import { computePph21ForEmployee } from "./compute-pph21";
import { fakeSupabase } from "../testing/fake-supabase";
import { baseTables, COMPANY_ID, EMP_BUDI } from "./fixtures";

function makeCtx(tables = baseTables()): ToolContext {
  return {
    supabase: fakeSupabase(tables) as unknown as SupabaseClient<Database>,
    companyId: COMPANY_ID,
    actorId: "user-1",
  };
}

const PERIOD = { employeeId: EMP_BUDI, year: 2026, month: 7 };

function haltCodes(result: Awaited<ReturnType<typeof executeTool>>): string[] {
  return result.status === "halt" ? result.reasons.map((r) => r.code) : [];
}

describe("compute_pph21_for_employee", () => {
  it("computes the statutory breakdown for a monthly-paid employee", async () => {
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    // Base 10,000,000, TK/0 → TER category A, top band 75 bps → 75,000.
    // BPJS employee side: kes 1% (100,000) + jht 2% (200,000) + jp 1% of the
    // capped 10,000,000 (100,000). Net = 10,000,000 − 475,000.
    expect(result.data.inputs).toMatchObject({
      baseSalary: 10_000_000,
      fixedAllowances: 0,
      gross: 10_000_000,
      ptkpStatus: "TK/0",
      terCategory: "A",
      hasNpwp: true,
      jkkRiskClass: "low",
    });
    expect(result.data.result.terRateBps).toBe(75);
    expect(result.data.result.pph21).toBe(75_000);
    expect(result.data.result.bpjsKesEmployee).toBe(100_000);
    expect(result.data.result.jhtEmployee).toBe(200_000);
    expect(result.data.result.jpEmployee).toBe(100_000);
    expect(result.data.result.netPay).toBe(9_525_000);
    // Integer rupiah, all the way through.
    for (const value of Object.values(result.data.result)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("applies the 120% no-NPWP surcharge", async () => {
    const tables = baseTables();
    tables.tax_profile[0]!.has_npwp = false;
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.result.pph21).toBe(90_000);
  });

  it("halts when the employee has no tax profile — never defaults to TK/0", async () => {
    const tables = baseTables();
    tables.tax_profile = [];
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("missing_tax_profile");
  });

  it("halts when no compensation row is in force on the period end", async () => {
    const tables = baseTables();
    tables.compensation[0]!.effective_from = "2026-08-01"; // future contract
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("missing_compensation");
  });

  it("halts for non-monthly pay frequencies in v0", async () => {
    const tables = baseTables();
    tables.compensation[0]!.pay_frequency = "daily";
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("unsupported_pay_frequency");
  });

  it("halts when approved overtime exists in the period (v0 would understate gross)", async () => {
    const tables = baseTables();
    tables.overtime_entries.push({
      id: "ot-1",
      company_id: COMPANY_ID,
      employee_id: EMP_BUDI,
      is_approved: true,
      date: "2026-07-10",
    });
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("overtime_not_supported");
  });

  it("adds taxable fixed earnings (with override) to gross — Puput's staging case", async () => {
    const tables = baseTables();
    tables.custom_earning_types.push(
      {
        id: "type-lunch",
        company_id: COMPANY_ID,
        name: "Lunch Accomodation",
        calc: "fixed",
        amount: 500_000,
        rate_bps: null,
        base: null,
        taxable: true,
        active: true,
      },
      {
        id: "type-transport",
        company_id: COMPANY_ID,
        name: "Transport Allowance",
        calc: "fixed",
        amount: 500_000,
        rate_bps: null,
        base: null,
        taxable: true,
        active: true,
      },
    );
    tables.employee_earning.push(
      {
        company_id: COMPANY_ID,
        employee_id: EMP_BUDI,
        custom_type_id: "type-lunch",
        amount_override: null,
        enabled: true,
      },
      {
        company_id: COMPANY_ID,
        employee_id: EMP_BUDI,
        custom_type_id: "type-transport",
        amount_override: 100_000,
        enabled: true,
      },
    );
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Gross 10,000,000 + 500,000 + 100,000 = 10,600,000, still in the 75 bps
    // TER band → PPh 21 = 79,500. BPJS bases stay on base salary.
    expect(result.data.inputs.gross).toBe(10_600_000);
    expect(result.data.result.pph21).toBe(79_500);
    expect(result.data.result.netPay).toBe(10_120_500);
    expect(result.data.earnings).toEqual([
      { label: "Lunch Accomodation", amount: 500_000, taxable: true },
      { label: "Transport Allowance", amount: 100_000, taxable: true },
    ]);
    expect(result.data.nonTaxableEarnings).toBe(0);
  });

  it("keeps non-taxable earnings out of gross but reports them", async () => {
    const tables = baseTables();
    tables.custom_earning_types.push({
      id: "type-reimb",
      company_id: COMPANY_ID,
      name: "Pulsa Reimbursement",
      calc: "fixed",
      amount: 200_000,
      rate_bps: null,
      base: null,
      taxable: false,
      active: true,
    });
    tables.employee_earning.push({
      company_id: COMPANY_ID,
      employee_id: EMP_BUDI,
      custom_type_id: "type-reimb",
      amount_override: null,
      enabled: true,
    });
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.inputs.gross).toBe(10_000_000);
    expect(result.data.result.pph21).toBe(75_000);
    expect(result.data.nonTaxableEarnings).toBe(200_000);
  });

  it("ignores disabled rows and inactive earning types", async () => {
    const tables = baseTables();
    tables.custom_earning_types.push(
      {
        id: "type-old",
        company_id: COMPANY_ID,
        name: "Old Allowance",
        calc: "fixed",
        amount: 1_000_000,
        rate_bps: null,
        base: null,
        taxable: true,
        active: false, // inactive type
      },
      {
        id: "type-off",
        company_id: COMPANY_ID,
        name: "Disabled Allowance",
        calc: "fixed",
        amount: 1_000_000,
        rate_bps: null,
        base: null,
        taxable: true,
        active: true,
      },
    );
    tables.employee_earning.push(
      {
        company_id: COMPANY_ID,
        employee_id: EMP_BUDI,
        custom_type_id: "type-old",
        amount_override: null,
        enabled: true,
      },
      {
        company_id: COMPANY_ID,
        employee_id: EMP_BUDI,
        custom_type_id: "type-off",
        amount_override: null,
        enabled: false, // disabled row
      },
    );
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.inputs.gross).toBe(10_000_000);
    expect(result.data.earnings).toEqual([]);
  });

  it("halts on percentage-based earnings in v0", async () => {
    const tables = baseTables();
    tables.custom_earning_types.push({
      id: "type-pct",
      company_id: COMPANY_ID,
      name: "Bonus Persen",
      calc: "percent",
      amount: null,
      rate_bps: 1_000,
      base: "base_salary",
      taxable: true,
      active: true,
    });
    tables.employee_earning.push({
      company_id: COMPANY_ID,
      employee_id: EMP_BUDI,
      custom_type_id: "type-pct",
      amount_override: null,
      enabled: true,
    });
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("percent_earnings_not_supported");
  });

  it("halts on an earning-group assignment in v0", async () => {
    const tables = baseTables();
    tables.employee_earning_group.push({
      company_id: COMPANY_ID,
      employee_id: EMP_BUDI,
      group_id: "group-1",
    });
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("earning_groups_not_supported");
  });

  it("halts when rate reference tables have no rows in force", async () => {
    const tables = baseTables();
    tables.ter_rates = [];
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("missing_rate_config");
  });

  it("halts on an unknown employee id", async () => {
    const result = await executeTool(
      computePph21ForEmployee,
      { ...PERIOD, employeeId: "99999999-0000-0000-0000-000000000009" },
      makeCtx(),
    );
    expect(result.status).toBe("halt");
    expect(haltCodes(result)).toContain("employee_not_found");
  });

  it("collects multiple halt reasons in one pass", async () => {
    const tables = baseTables();
    tables.tax_profile = [];
    tables.company_settings = [];
    const result = await executeTool(computePph21ForEmployee, PERIOD, makeCtx(tables));
    expect(result.status).toBe("halt");
    const codes = haltCodes(result);
    expect(codes).toContain("missing_tax_profile");
    expect(codes).toContain("missing_jkk_risk_class");
  });
});
