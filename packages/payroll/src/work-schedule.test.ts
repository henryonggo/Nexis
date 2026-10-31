import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORK_DAYS,
  normalizeWorkDays,
  isoWeekday,
  isExpectedWorkday,
  expectedWorkdaysInMonth,
  expectedWorkdaysFrom,
  hireProrationFactor,
  prorateByFactor,
} from "./work-schedule";

const MON_FRI = [1, 2, 3, 4, 5];

describe("normalizeWorkDays", () => {
  it("defaults to Mon–Fri for non-array input", () => {
    expect(normalizeWorkDays(undefined)).toEqual(DEFAULT_WORK_DAYS);
    expect(normalizeWorkDays(null)).toEqual(DEFAULT_WORK_DAYS);
    expect(normalizeWorkDays("garbage")).toEqual(DEFAULT_WORK_DAYS);
  });

  it("defaults to Mon–Fri for an empty or all-invalid array", () => {
    expect(normalizeWorkDays([])).toEqual(DEFAULT_WORK_DAYS);
    expect(normalizeWorkDays([0, 8, -1, "x"])).toEqual(DEFAULT_WORK_DAYS);
  });

  it("dedupes and sorts a valid set", () => {
    expect(normalizeWorkDays([5, 1, 3, 1, "2"])).toEqual([1, 2, 3, 5]);
  });

  it("accepts a 6-day (Mon–Sat) schedule", () => {
    expect(normalizeWorkDays([1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("isoWeekday", () => {
  it("maps known dates to ISO weekday (1=Mon..7=Sun)", () => {
    expect(isoWeekday("2026-07-01")).toBe(3); // Wednesday
    expect(isoWeekday("2026-07-17")).toBe(5); // Friday
    expect(isoWeekday("2026-07-25")).toBe(6); // Saturday
    expect(isoWeekday("2026-07-26")).toBe(7); // Sunday
  });
});

describe("isExpectedWorkday", () => {
  it("checks a date against a schedule", () => {
    expect(isExpectedWorkday(MON_FRI, "2026-07-17")).toBe(true); // Friday
    expect(isExpectedWorkday(MON_FRI, "2026-07-25")).toBe(false); // Saturday
    expect(isExpectedWorkday([1, 2, 3, 4, 5, 6], "2026-07-25")).toBe(true);
  });
});

describe("expectedWorkdaysInMonth", () => {
  it("counts Mon–Fri working days in July 2026 (hand-counted: 23)", () => {
    expect(expectedWorkdaysInMonth(MON_FRI, 2026, 7)).toBe(23);
  });

  it("counts Mon–Fri working days in Feb 2026, a non-leap 28-day month (hand-counted: 20)", () => {
    expect(expectedWorkdaysInMonth(MON_FRI, 2026, 2)).toBe(20);
  });

  it("a 6-day schedule counts more days than a 5-day schedule in the same month", () => {
    const sixDay = expectedWorkdaysInMonth([1, 2, 3, 4, 5, 6], 2026, 7);
    const fiveDay = expectedWorkdaysInMonth(MON_FRI, 2026, 7);
    expect(sixDay).toBeGreaterThan(fiveDay);
  });
});

describe("expectedWorkdaysFrom", () => {
  it("hire on the 1st of the month counts the whole month (July 2026: 23)", () => {
    expect(expectedWorkdaysFrom(MON_FRI, "2026-07-01", 2026, 7)).toBe(23);
  });

  it("counts the whole month for a fromDate before the month starts", () => {
    expect(expectedWorkdaysFrom(MON_FRI, "2026-06-01", 2026, 7)).toBe(23);
  });

  it("hire on 2026-07-17 (Friday) counts 11 remaining working days through 2026-07-31", () => {
    // Hand-counted Mon–Fri working days: 17,20,21,22,23,24,27,28,29,30,31 = 11.
    expect(expectedWorkdaysFrom(MON_FRI, "2026-07-17", 2026, 7)).toBe(11);
  });

  it("hire on the month's last working day counts exactly 1 (Feb 2026: last working day is the 27th, a Friday)", () => {
    expect(expectedWorkdaysFrom(MON_FRI, "2026-02-27", 2026, 2)).toBe(1);
  });

  it("hire the calendar day after the last working day counts 0 (Feb 2026: the 28th is a Saturday)", () => {
    expect(expectedWorkdaysFrom(MON_FRI, "2026-02-28", 2026, 2)).toBe(0);
  });

  it("a fromDate entirely after the month returns 0", () => {
    expect(expectedWorkdaysFrom(MON_FRI, "2026-08-01", 2026, 7)).toBe(0);
  });
});

describe("hireProrationFactor", () => {
  it("hire on the 1st (a working day) gives worked/total = total/total (factor 1.0)", () => {
    const f = hireProrationFactor(MON_FRI, "2026-07-01", 2026, 7);
    expect(f).toEqual({ workedDays: 23, totalDays: 23 });
    expect(f.workedDays / f.totalDays).toBe(1);
  });

  it("hire mid-month (2026-07-17, staging E-7) gives 11/23", () => {
    const f = hireProrationFactor(MON_FRI, "2026-07-17", 2026, 7);
    expect(f).toEqual({ workedDays: 11, totalDays: 23 });
  });

  it("hire on the month's last working day gives the smallest non-zero factor (1/total)", () => {
    const f = hireProrationFactor(MON_FRI, "2026-02-27", 2026, 2);
    expect(f).toEqual({ workedDays: 1, totalDays: 20 });
    expect(f.workedDays / f.totalDays).toBeCloseTo(1 / 20);
    expect(f.workedDays).toBeGreaterThan(0);
  });

  it("hire after the month's last working day gives a zero factor", () => {
    const f = hireProrationFactor(MON_FRI, "2026-02-28", 2026, 2);
    expect(f).toEqual({ workedDays: 0, totalDays: 20 });
  });
});

describe("prorateByFactor", () => {
  it("factor 1.0 (hired on the 1st) leaves the amount unchanged", () => {
    expect(prorateByFactor(5_000_000, { workedDays: 23, totalDays: 23 })).toBe(5_000_000);
  });

  it("prorates base salary by 11/23 (staging E-7, hand-computed)", () => {
    // 5,000,000 * 11 / 23 = 2,391,304.347... -> rounds to 2,391,304.
    expect(prorateByFactor(5_000_000, { workedDays: 11, totalDays: 23 })).toBe(2_391_304);
  });

  it("prorates a fixed allowance by the same 11/23 factor (hand-computed)", () => {
    // 500,000 * 11 / 23 = 239,130.434... -> rounds to 239,130.
    expect(prorateByFactor(500_000, { workedDays: 11, totalDays: 23 })).toBe(239_130);
  });

  it("a zero factor prorates to 0", () => {
    expect(prorateByFactor(5_000_000, { workedDays: 0, totalDays: 20 })).toBe(0);
  });

  it("a misconfigured zero-total schedule prorates to 0 rather than dividing by zero", () => {
    expect(prorateByFactor(5_000_000, { workedDays: 0, totalDays: 0 })).toBe(0);
  });
});
