import { describe, it, expect } from "vitest";
import {
  computeMonthlyPayroll,
  computeOvertimePay,
  overtimePayWeekday,
  overtimePayRestDay,
  ptkpCategory,
  progressiveTax,
  computeDecemberReconciliation,
  computeThr,
  type EmployeePayrollInput,
} from "./index";
import { MONTHLY_CONFIG, ANNUAL_CONFIG } from "./fixtures";

const base = {
  fixedAllowances: 0,
  overtimePay: 0,
  variableEarnings: 0,
  jkkRiskClass: "very_low" as const,
  bpjsKesEnrolled: true,
  jhtEnrolled: true,
  jpEnrolled: true,
};

function run(input: Partial<EmployeePayrollInput> & Pick<EmployeePayrollInput, "baseSalary" | "ptkpStatus" | "hasNpwp">) {
  return computeMonthlyPayroll({ ...base, ...input }, MONTHLY_CONFIG);
}

describe("PTKP → TER category mapping (PMK 168/2023)", () => {
  it("maps each PTKP status to A/B/C", () => {
    expect(ptkpCategory("TK/0")).toBe("A");
    expect(ptkpCategory("K/0")).toBe("A");
    expect(ptkpCategory("TK/2")).toBe("B");
    expect(ptkpCategory("K/2")).toBe("B");
    expect(ptkpCategory("K/3")).toBe("C");
  });
});

describe("monthly payroll fixtures (hand-verified to the rupiah)", () => {
  // Fixture 1 — TK/0, 10jt, with NPWP. TER A @10jt = 2%.
  it("Fixture 1: TK/0 10jt NPWP", () => {
    const r = run({ baseSalary: 10_000_000, ptkpStatus: "TK/0", hasNpwp: true });
    expect(r.gross).toBe(10_000_000);
    expect(r.terRateBps).toBe(200);
    expect(r.pph21).toBe(200_000);
    expect(r.bpjsKesEmployee).toBe(100_000);
    expect(r.jhtEmployee).toBe(200_000);
    expect(r.jpEmployee).toBe(100_000);
    expect(r.netPay).toBe(9_400_000); // 10jt − 400k BPJS − 200k tax
  });

  // Fixture 2 — same, no NPWP → +20% on PPh 21.
  it("Fixture 2: TK/0 10jt no NPWP (+20%)", () => {
    const r = run({ baseSalary: 10_000_000, ptkpStatus: "TK/0", hasNpwp: false });
    expect(r.pph21).toBe(240_000); // 200k × 1.2
    expect(r.netPay).toBe(9_360_000);
  });

  // Fixture 3 — K/0 (cat A), 20jt: BPJS caps bite, TER A @20jt = 5%.
  it("Fixture 3: K/0 20jt NPWP, at BPJS caps", () => {
    const r = run({ baseSalary: 20_000_000, ptkpStatus: "K/0", hasNpwp: true });
    expect(r.terRateBps).toBe(500);
    expect(r.pph21).toBe(1_000_000);
    expect(r.bpjsKesEmployee).toBe(120_000); // 1% of 12jt cap
    expect(r.jpEmployee).toBe(105_474); // 1% of 10,547,400 cap
    expect(r.jhtEmployee).toBe(400_000); // 2% of 20jt (uncapped)
    expect(r.bpjsKesEmployer).toBe(480_000); // 4% of 12jt cap
    expect(r.jkkEmployer).toBe(48_000); // 0.24% of 20jt
    expect(r.jkmEmployer).toBe(60_000); // 0.30% of 20jt
    expect(r.netPay).toBe(18_374_526);
  });

  // Fixture 4 — K/3 (cat C), 15jt: TER C @15jt = 4%.
  it("Fixture 4: K/3 15jt NPWP (category C)", () => {
    const r = run({ baseSalary: 15_000_000, ptkpStatus: "K/3", hasNpwp: true });
    expect(r.terRateBps).toBe(400);
    expect(r.pph21).toBe(600_000);
    expect(r.bpjsKesEmployee).toBe(120_000); // capped
    expect(r.jpEmployee).toBe(105_474); // capped
    expect(r.jhtEmployee).toBe(300_000);
    expect(r.netPay).toBe(13_874_526);
  });

  // Fixture 5 — integrated monthly run with weekday overtime, TK/1 (cat A).
  it("Fixture 5: 8.65jt + 2h weekday overtime", () => {
    const overtimePay = computeOvertimePay({ monthlyWage: 8_650_000, weekdayHours: 2 });
    expect(overtimePay).toBe(175_000); // 50k base: 1×1.5 + 1×2.0
    const r = run({
      baseSalary: 8_650_000,
      overtimePay,
      ptkpStatus: "TK/1",
      hasNpwp: true,
    });
    expect(r.gross).toBe(8_825_000);
    expect(r.terRateBps).toBe(25); // TER A @8.825jt = 0.25%
    expect(r.pph21).toBe(22_063);
    expect(r.netPay).toBe(8_456_937);
  });
});

describe("overtime pay (statutory multipliers)", () => {
  it("weekday: 1st hour ×1.5, rest ×2.0", () => {
    // wage 3,460,000 → hourly base exactly 20,000.
    expect(overtimePayWeekday(1, 3_460_000)).toBe(30_000);
    expect(overtimePayWeekday(3, 3_460_000)).toBe(110_000); // 30k + 2×40k
    expect(overtimePayWeekday(0, 3_460_000)).toBe(0);
  });

  it("rest day: 1–8 ×2.0, 9th ×3.0, 10–11 ×4.0", () => {
    expect(overtimePayRestDay(8, 3_460_000)).toBe(320_000); // 8 × 40k
    expect(overtimePayRestDay(9, 3_460_000)).toBe(380_000); // + 60k
    expect(overtimePayRestDay(10, 3_460_000)).toBe(460_000); // + 80k
    expect(overtimePayRestDay(11, 3_460_000)).toBe(540_000); // + another 80k
  });
});

describe("progressive tax (UU HPP brackets)", () => {
  it("returns 0 for non-positive PKP", () => {
    expect(progressiveTax(0, ANNUAL_CONFIG.brackets)).toBe(0);
    expect(progressiveTax(-5_000, ANNUAL_CONFIG.brackets)).toBe(0);
  });

  it("taxes across multiple brackets", () => {
    // 318,500,000 → 5%×60M + 15%×190M + 25%×68.5M
    expect(progressiveTax(318_500_000, ANNUAL_CONFIG.brackets)).toBe(48_625_000);
  });
});

describe("December reconciliation", () => {
  // Fixture 6 — single-bracket annual, biaya jabatan at cap.
  it("Fixture 6: TK/0 annual 120jt", () => {
    const r = computeDecemberReconciliation(
      {
        annualGross: 120_000_000,
        ptkpStatus: "TK/0",
        hasNpwp: true,
        annualPensionJhtEmployee: 2_400_000,
        ytdPph21Withheld: 2_500_000,
      },
      ANNUAL_CONFIG,
    );
    expect(r.biayaJabatan).toBe(6_000_000); // 5% of 120jt = 6jt = cap
    expect(r.annualNet).toBe(111_600_000);
    expect(r.pkp).toBe(57_600_000);
    expect(r.annualTax).toBe(2_880_000); // 5% (within first bracket)
    expect(r.decemberWithholding).toBe(380_000); // 2.88jt − 2.5jt YTD
  });

  // Fixture 7 — multi-bracket annual with capped biaya jabatan.
  it("Fixture 7: K/2 annual 400jt", () => {
    const r = computeDecemberReconciliation(
      {
        annualGross: 400_000_000,
        ptkpStatus: "K/2",
        hasNpwp: true,
        annualPensionJhtEmployee: 8_000_000,
        ytdPph21Withheld: 40_000_000,
      },
      ANNUAL_CONFIG,
    );
    expect(r.biayaJabatan).toBe(6_000_000); // 5% would be 20jt → capped
    expect(r.pkp).toBe(318_500_000);
    expect(r.annualTax).toBe(48_625_000);
    expect(r.decemberWithholding).toBe(8_625_000);
  });

  it("applies the no-NPWP surcharge to the annual tax", () => {
    const r = computeDecemberReconciliation(
      {
        annualGross: 120_000_000,
        ptkpStatus: "TK/0",
        hasNpwp: false,
        annualPensionJhtEmployee: 2_400_000,
        ytdPph21Withheld: 0,
      },
      ANNUAL_CONFIG,
    );
    expect(r.annualTax).toBe(3_456_000); // 2,880,000 × 1.2
  });
});

describe("THR proration", () => {
  it("pays a full month at ≥12 months service", () => {
    expect(computeThr(6_000_000, 12)).toBe(6_000_000);
    expect(computeThr(6_000_000, 18)).toBe(6_000_000);
  });
  it("prorates below 12 months", () => {
    expect(computeThr(6_000_000, 6)).toBe(3_000_000);
    expect(computeThr(6_000_000, 3)).toBe(1_500_000);
  });
  it("pays nothing below 1 month tenure", () => {
    expect(computeThr(6_000_000, 0)).toBe(0);
  });
});
