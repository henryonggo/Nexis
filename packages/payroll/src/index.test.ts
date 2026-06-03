import { describe, it, expect } from "vitest";
import { computeMonthlyPayroll, overtimeHourlyBase, type PayrollConfig } from "./index";

// A representative config snapshot (rates as data — see docs/05-indonesian-compliance.md).
const cfg: PayrollConfig = {
  bpjsKesEmployeeBps: 100, // 1%
  bpjsKesEmployerBps: 400, // 4%
  jhtEmployeeBps: 200, // 2%
  jhtEmployerBps: 370, // 3.7%
  jpEmployeeBps: 100, // 1%
  jpEmployerBps: 200, // 2%
  jkmEmployerBps: 30, // 0.30%
  jkkEmployerBpsByRisk: { very_low: 24, low: 54, medium: 89, high: 127, very_high: 174 },
  bpjsKesCap: 12_000_000,
  jpCap: 10_547_400,
  terRateBps: () => 200, // stub 2% TER for deterministic assertions
};

const base = {
  fixedAllowances: 0,
  overtimePay: 0,
  jkkRiskClass: "very_low" as const,
  bpjsKesEnrolled: true,
  jhtEnrolled: true,
  jpEnrolled: true,
};

describe("Indonesian payroll engine", () => {
  it("computes net pay for TK/0, salary 10jt, with NPWP", () => {
    const r = computeMonthlyPayroll(
      { ...base, baseSalary: 10_000_000, ptkpStatus: "TK/0", hasNpwp: true },
      cfg,
    );
    expect(r.gross).toBe(10_000_000);
    expect(r.bpjsKesEmployee).toBe(100_000); // 1%
    expect(r.jhtEmployee).toBe(200_000); // 2%
    expect(r.jpEmployee).toBe(100_000); // 1% (under cap)
    expect(r.pph21).toBe(200_000); // 2% TER
    // net = 10,000,000 - (100k + 200k + 100k) - 200k
    expect(r.netPay).toBe(9_400_000);
  });

  it("applies the +20% PPh 21 surcharge when the employee has no NPWP", () => {
    const withNpwp = computeMonthlyPayroll(
      { ...base, baseSalary: 10_000_000, ptkpStatus: "TK/0", hasNpwp: true },
      cfg,
    );
    const noNpwp = computeMonthlyPayroll(
      { ...base, baseSalary: 10_000_000, ptkpStatus: "TK/0", hasNpwp: false },
      cfg,
    );
    expect(noNpwp.pph21).toBe(Math.round(withNpwp.pph21 * 1.2));
  });

  it("caps BPJS Kesehatan and JP at the wage ceilings", () => {
    const r = computeMonthlyPayroll(
      { ...base, baseSalary: 20_000_000, ptkpStatus: "K/0", hasNpwp: true },
      cfg,
    );
    expect(r.bpjsKesEmployee).toBe(120_000); // 1% of 12,000,000 cap
    expect(r.jpEmployee).toBe(105_474); // 1% of 10,547,400 cap
  });

  it("respects enrollment toggles", () => {
    const r = computeMonthlyPayroll(
      {
        ...base,
        baseSalary: 8_000_000,
        ptkpStatus: "TK/0",
        hasNpwp: true,
        bpjsKesEnrolled: false,
        jpEnrolled: false,
      },
      cfg,
    );
    expect(r.bpjsKesEmployee).toBe(0);
    expect(r.jpEmployee).toBe(0);
    expect(r.jhtEmployee).toBe(160_000); // still enrolled, 2%
  });

  it("computes the 1/173 overtime hourly base", () => {
    expect(overtimeHourlyBase(3_460_000)).toBe(20_000);
  });
});
