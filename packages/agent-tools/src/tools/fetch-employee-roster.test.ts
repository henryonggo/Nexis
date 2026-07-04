import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { executeTool, type ToolContext } from "../tool";
import { fetchEmployeeRoster } from "./fetch-employee-roster";
import { fakeSupabase } from "../testing/fake-supabase";
import { baseTables, COMPANY_ID, EMP_AGUS, EMP_BUDI, EMP_SITI } from "./fixtures";

function makeCtx(tables = baseTables()): ToolContext {
  return {
    supabase: fakeSupabase(tables) as unknown as SupabaseClient<Database>,
    companyId: COMPANY_ID,
    actorId: "user-1",
  };
}

describe("fetch_employee_roster", () => {
  it("returns active employees with completeness flags", async () => {
    const result = await executeTool(fetchEmployeeRoster, {}, makeCtx());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    // Sorted by name: Budi, Siti. Agus is inactive and excluded by default.
    expect(result.data.employees.map((e) => e.employeeId)).toEqual([EMP_BUDI, EMP_SITI]);

    const budi = result.data.employees[0]!;
    expect(budi).toMatchObject({
      fullName: "Budi Santoso",
      payFrequency: "monthly",
      baseSalary: 10_000_000,
      hasCompensation: true,
      hasTaxProfile: true,
      ptkpStatus: "TK/0",
      hasNpwp: true,
    });

    // Siti has neither compensation nor tax profile → flagged, not guessed.
    const siti = result.data.employees[1]!;
    expect(siti).toMatchObject({
      hasCompensation: false,
      hasTaxProfile: false,
      baseSalary: null,
      ptkpStatus: null,
      hasNpwp: null,
    });
    expect(result.data.incomplete).toEqual([
      { employeeId: EMP_SITI, missing: ["compensation", "tax_profile"] },
    ]);
  });

  it("includes inactive employees when asked", async () => {
    const result = await executeTool(fetchEmployeeRoster, { includeInactive: true }, makeCtx());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.employees.map((e) => e.employeeId)).toEqual([
      EMP_AGUS,
      EMP_BUDI,
      EMP_SITI,
    ]);
  });

  it("uses the latest compensation row per employee", async () => {
    const tables = baseTables();
    tables.compensation.push({
      company_id: COMPANY_ID,
      employee_id: EMP_BUDI,
      base_salary: 12_500_000,
      pay_frequency: "monthly",
      fixed_allowances: 0,
      bpjs_kes_enrolled: true,
      jht_enrolled: true,
      jp_enrolled: true,
      effective_from: "2026-01-01",
    });
    const result = await executeTool(fetchEmployeeRoster, {}, makeCtx(tables));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.employees[0]!.baseSalary).toBe(12_500_000);
  });

  it("surfaces a query failure as a structured error", async () => {
    const tables = baseTables();
    const supabase = fakeSupabase(tables, {
      failTables: { employees: "permission denied" },
    }) as unknown as SupabaseClient<Database>;
    const result = await executeTool(
      fetchEmployeeRoster,
      {},
      { supabase, companyId: COMPANY_ID, actorId: null },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toMatch(/employees: permission denied/);
  });
});
