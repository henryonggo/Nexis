import { describe, it, expect } from "vitest";
import { toRupiah, sum, subtract, percentBps, capAt, formatRupiah, parseRupiah } from "./index";

describe("money", () => {
  it("rounds to whole rupiah", () => {
    expect(toRupiah(1250.4)).toBe(1250);
    expect(toRupiah(1250.5)).toBe(1251);
  });

  it("sums and subtracts", () => {
    expect(sum(100, 200, 300)).toBe(600);
    expect(subtract(1000, 250)).toBe(750);
  });

  it("computes basis-point percentages (BPJS-style)", () => {
    // 1% of 10,000,000 = 100,000  (e.g. BPJS Kesehatan employee share)
    expect(percentBps(10_000_000, 100)).toBe(100_000);
    // 3.7% of 10,000,000 = 370,000 (JHT employer share)
    expect(percentBps(10_000_000, 370)).toBe(370_000);
  });

  it("caps wages at a ceiling", () => {
    expect(capAt(15_000_000, 12_000_000)).toBe(12_000_000);
    expect(capAt(8_000_000, 12_000_000)).toBe(8_000_000);
  });

  it("formats and parses Indonesian rupiah", () => {
    expect(formatRupiah(1_250_000)).toBe("Rp 1.250.000");
    expect(formatRupiah(1_250_000, { withSymbol: false })).toBe("1.250.000");
    expect(parseRupiah("Rp 1.250.000")).toBe(1_250_000);
    expect(parseRupiah("1250000")).toBe(1_250_000);
  });

  it("rejects non-finite money", () => {
    expect(() => toRupiah(Infinity)).toThrow();
    expect(() => toRupiah(NaN)).toThrow();
  });
});
