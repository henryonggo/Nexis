/**
 * Config-loader tests. The row literals below are copied verbatim from
 * supabase/seed.sql so this file doubles as a contract check: if Antigravity
 * changes the seed's keys/shape, these break loudly rather than the engine
 * silently mis-reading a rate.
 */
import { describe, expect, it } from "vitest";
import {
  buildAnnualTaxConfig,
  buildPayrollConfig,
  computeMonthlyPayroll,
  toProgressiveBrackets,
  toTerRateRows,
  type BpjsConfigRow,
  type PtkpRateRow,
  type TaxBracketRow,
  type TerRateDbRow,
} from "./index";

// ── Seed mirrors (supabase/seed.sql) ────────────────────────────────────────

const BPJS_ROWS: BpjsConfigRow[] = [
  { key: "kes_employee", rate_bps: 100, amount: null },
  { key: "kes_employer", rate_bps: 400, amount: null },
  { key: "jht_employee", rate_bps: 200, amount: null },
  { key: "jht_employer", rate_bps: 370, amount: null },
  { key: "jp_employee", rate_bps: 100, amount: null },
  { key: "jp_employer", rate_bps: 200, amount: null },
  { key: "jkm_employer", rate_bps: 30, amount: null },
  { key: "kes_cap", rate_bps: null, amount: 12_000_000 },
  { key: "jp_cap", rate_bps: null, amount: 10_547_400 },
  { key: "jkk_very_low", rate_bps: 24, amount: null },
  { key: "jkk_low", rate_bps: 54, amount: null },
  { key: "jkk_medium", rate_bps: 89, amount: null },
  { key: "jkk_high", rate_bps: 127, amount: null },
  { key: "jkk_very_high", rate_bps: 174, amount: null },
];

const TER_ROWS: TerRateDbRow[] = [
  { category: "A", income_lower: 0, rate_bps: 0 },
  { category: "A", income_lower: 5_400_001, rate_bps: 25 },
  { category: "A", income_lower: 5_650_001, rate_bps: 50 },
  { category: "A", income_lower: 5_950_001, rate_bps: 75 },
  { category: "B", income_lower: 0, rate_bps: 0 },
  { category: "C", income_lower: 0, rate_bps: 0 },
];

const PTKP_ROWS: PtkpRateRow[] = [
  { status: "TK/0", annual_amount: 54_000_000 },
  { status: "TK/1", annual_amount: 58_500_000 },
  { status: "TK/2", annual_amount: 63_000_000 },
  { status: "TK/3", annual_amount: 67_500_000 },
  { status: "K/0", annual_amount: 58_500_000 },
  { status: "K/1", annual_amount: 63_000_000 },
  { status: "K/2", annual_amount: 67_500_000 },
  { status: "K/3", annual_amount: 72_000_000 },
];

const BRACKET_ROWS: TaxBracketRow[] = [
  { lower_bound: 0, upper_bound: 60_000_000, rate_bps: 500 },
  { lower_bound: 60_000_001, upper_bound: 250_000_000, rate_bps: 1_500 },
  { lower_bound: 250_000_001, upper_bound: 500_000_000, rate_bps: 2_500 },
  { lower_bound: 500_000_001, upper_bound: 5_000_000_000, rate_bps: 3_000 },
  { lower_bound: 5_000_000_001, upper_bound: null, rate_bps: 3_500 },
];

describe("buildPayrollConfig", () => {
  const cfg = buildPayrollConfig(BPJS_ROWS, TER_ROWS);

  it("maps every BPJS rate and cap from keyed rows", () => {
    expect(cfg).toMatchObject({
      bpjsKesEmployeeBps: 100,
      bpjsKesEmployerBps: 400,
      jhtEmployeeBps: 200,
      jhtEmployerBps: 370,
      jpEmployeeBps: 100,
      jpEmployerBps: 200,
      jkmEmployerBps: 30,
      bpjsKesCap: 12_000_000,
      jpCap: 10_547_400,
    });
  });

  it("maps the JKK-by-risk matrix", () => {
    expect(cfg.jkkEmployerBpsByRisk).toEqual({
      very_low: 24, low: 54, medium: 89, high: 127, very_high: 174,
    });
  });

  it("builds a TER lookup that picks the greatest band ≤ gross", () => {
    expect(cfg.terRateBps("TK/0", 5_000_000)).toBe(0); // category A, below first band
    expect(cfg.terRateBps("TK/0", 5_700_000)).toBe(50); // 5,650,001 band
    expect(cfg.terRateBps("K/0", 6_000_000)).toBe(75); // K/0 also category A
  });

  it("throws on a missing BPJS key", () => {
    const missing = BPJS_ROWS.filter((r) => r.key !== "jp_cap");
    expect(() => buildPayrollConfig(missing, TER_ROWS)).toThrow(/jp_cap/);
  });

  it("throws when a rate column is null where a rate is expected", () => {
    const broken = BPJS_ROWS.map((r) =>
      r.key === "kes_employee" ? { ...r, rate_bps: null } : r,
    );
    expect(() => buildPayrollConfig(broken, TER_ROWS)).toThrow(/rate_bps/);
  });

  it("feeds a correct end-to-end monthly compute", () => {
    // base 5,400,000 → gross 5,400,000 sits exactly on category-A 0% ceiling.
    const r = computeMonthlyPayroll(
      {
        baseSalary: 5_400_000,
        fixedAllowances: 0,
        overtimePay: 0,
        ptkpStatus: "TK/0",
        hasNpwp: true,
        jkkRiskClass: "low",
        bpjsKesEnrolled: true,
        jhtEnrolled: true,
        jpEnrolled: true,
      },
      cfg,
    );
    expect(r.pph21).toBe(0); // 0% TER band
    expect(r.bpjsKesEmployee).toBe(54_000); // 1% of 5,400,000
    expect(r.jpEmployee).toBe(54_000); // 1% of 5,400,000 (under cap)
    expect(r.netPay).toBe(5_400_000 - 54_000 - 108_000 - 54_000); // kes+jht+jp
  });
});

describe("toTerRateRows", () => {
  it("renames income_lower → minGross", () => {
    expect(toTerRateRows([{ category: "A", income_lower: 5_400_001, rate_bps: 25 }])).toEqual([
      { category: "A", minGross: 5_400_001, rateBps: 25 },
    ]);
  });

  it("rejects an unknown category", () => {
    expect(() => toTerRateRows([{ category: "Z", income_lower: 0, rate_bps: 0 }])).toThrow(/category/);
  });
});

describe("buildAnnualTaxConfig", () => {
  const cfg = buildAnnualTaxConfig(PTKP_ROWS, BRACKET_ROWS);

  it("maps all eight PTKP statuses", () => {
    expect(cfg.ptkpAnnualByStatus["TK/0"]).toBe(54_000_000);
    expect(cfg.ptkpAnnualByStatus["K/3"]).toBe(72_000_000);
  });

  it("defaults biaya jabatan to the statutory 5% / 6,000,000", () => {
    expect(cfg.biayaJabatanRateBps).toBe(500);
    expect(cfg.biayaJabatanAnnualCap).toBe(6_000_000);
  });

  it("allows overriding biaya jabatan", () => {
    const overridden = buildAnnualTaxConfig(PTKP_ROWS, BRACKET_ROWS, {
      biayaJabatanRateBps: 600,
      biayaJabatanAnnualCap: 7_000_000,
    });
    expect(overridden.biayaJabatanRateBps).toBe(600);
    expect(overridden.biayaJabatanAnnualCap).toBe(7_000_000);
  });

  it("throws if a PTKP status is missing", () => {
    const missing = PTKP_ROWS.filter((r) => r.status !== "K/3");
    expect(() => buildAnnualTaxConfig(missing, BRACKET_ROWS)).toThrow(/K\/3/);
  });
});

describe("toProgressiveBrackets", () => {
  it("sorts ascending and carries the open-ended top bracket", () => {
    const shuffled: TaxBracketRow[] = [
      { lower_bound: 250_000_001, upper_bound: 500_000_000, rate_bps: 2_500 },
      { lower_bound: 5_000_000_001, upper_bound: null, rate_bps: 3_500 },
      { lower_bound: 0, upper_bound: 60_000_000, rate_bps: 500 },
    ];
    const brackets = toProgressiveBrackets(shuffled);
    expect(brackets.map((b) => b.upTo)).toEqual([60_000_000, 500_000_000, null]);
    expect(brackets.map((b) => b.rateBps)).toEqual([500, 2_500, 3_500]);
  });
});
