import { describe, it, expect } from "vitest";
import {
  effectiveOn,
  sumFixedAllowances,
  periodStart,
  periodEnd,
  PTKP_STATUSES,
  JKK_RISK_CLASSES,
} from "./statutory";

describe("PTKP_STATUSES / JKK_RISK_CLASSES", () => {
  it("has the 8 valid PTKP statuses", () => {
    expect([...PTKP_STATUSES].sort()).toEqual(
      ["K/0", "K/1", "K/2", "K/3", "TK/0", "TK/1", "TK/2", "TK/3"].sort(),
    );
  });

  it("has the 5 JKK risk classes", () => {
    expect([...JKK_RISK_CLASSES].sort()).toEqual(
      ["high", "low", "medium", "very_high", "very_low"].sort(),
    );
  });
});

describe("effectiveOn", () => {
  interface Row {
    id: string;
    effective_from: string;
    effective_to: string | null;
  }

  it("includes a row starting exactly on the given date", () => {
    const rows: Row[] = [{ id: "a", effective_from: "2026-07-14", effective_to: null }];
    expect(effectiveOn(rows, "2026-07-14")).toEqual(rows);
  });

  it("includes a row ending exactly on the given date", () => {
    const rows: Row[] = [{ id: "a", effective_from: "2026-01-01", effective_to: "2026-07-14" }];
    expect(effectiveOn(rows, "2026-07-14")).toEqual(rows);
  });

  it("includes an open-ended row (null effective_to) whose start is in the past", () => {
    const rows: Row[] = [{ id: "a", effective_from: "2020-01-01", effective_to: null }];
    expect(effectiveOn(rows, "2026-07-14")).toEqual(rows);
  });

  it("excludes a row that starts after the given date", () => {
    const rows: Row[] = [{ id: "a", effective_from: "2026-07-15", effective_to: null }];
    expect(effectiveOn(rows, "2026-07-14")).toEqual([]);
  });

  it("excludes a row that ended before the given date", () => {
    const rows: Row[] = [{ id: "a", effective_from: "2025-01-01", effective_to: "2026-07-13" }];
    expect(effectiveOn(rows, "2026-07-14")).toEqual([]);
  });
});

describe("sumFixedAllowances", () => {
  it("returns a plain number rounded to the nearest whole rupiah", () => {
    expect(sumFixedAllowances(500_000)).toBe(500_000);
    expect(sumFixedAllowances(500_000.6)).toBe(500_001);
  });

  it("sums an array of numbers", () => {
    expect(sumFixedAllowances([100_000, 200_000, 50_000])).toBe(350_000);
  });

  it("sums an array of {amount} objects", () => {
    expect(
      sumFixedAllowances([{ amount: 100_000 }, { amount: 250_000 }]),
    ).toBe(350_000);
  });

  it("sums a { label: amount } map", () => {
    expect(sumFixedAllowances({ transport: 100_000, meal: 200_000 })).toBe(300_000);
  });

  it("returns 0 for null/undefined", () => {
    expect(sumFixedAllowances(null)).toBe(0);
    expect(sumFixedAllowances(undefined)).toBe(0);
  });

  it("returns 0 for a garbage string", () => {
    expect(sumFixedAllowances("not a number")).toBe(0);
  });

  it("skips non-finite entries within an array/map instead of throwing", () => {
    expect(sumFixedAllowances([100_000, { amount: "garbage" }, 50_000])).toBe(150_000);
    expect(sumFixedAllowances({ transport: 100_000, bogus: "garbage" })).toBe(100_000);
  });
});

describe("periodStart", () => {
  it("returns YYYY-MM-01", () => {
    expect(periodStart(2026, 7)).toBe("2026-07-01");
    expect(periodStart(2026, 1)).toBe("2026-01-01");
  });
});

describe("periodEnd", () => {
  it("returns the last day of a non-leap February", () => {
    expect(periodEnd(2026, 2)).toBe("2026-02-28");
  });

  it("returns the last day of a leap February", () => {
    expect(periodEnd(2028, 2)).toBe("2028-02-29");
  });

  it("returns the last day of a 31-day month", () => {
    expect(periodEnd(2026, 7)).toBe("2026-07-31");
  });
});
