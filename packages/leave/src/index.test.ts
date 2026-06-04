import { describe, expect, it } from "vitest";
import {
  accruedAsOf,
  activeMonthsInYear,
  annualEntitlement,
  availableBalance,
  carryOver,
  countLeaveDays,
  monthsOfService,
  roundHalfDay,
  validateLeaveRequest,
  type LeavePolicy,
} from "./index";

const LUMP: LeavePolicy = { annualDays: 12, accrualMethod: "annual_lump", minServiceMonths: 0, maxCarryOverDays: 6 };
const MONTHLY: LeavePolicy = { annualDays: 12, accrualMethod: "monthly", minServiceMonths: 0, maxCarryOverDays: 6 };
const STATUTORY: LeavePolicy = { annualDays: 12, accrualMethod: "annual_lump", minServiceMonths: 12, maxCarryOverDays: 6 };

describe("monthsOfService", () => {
  it("counts completed months, gated on the day-of-month", () => {
    expect(monthsOfService("2023-01-15", "2024-01-15")).toBe(12); // anniversary reached
    expect(monthsOfService("2023-01-15", "2024-01-14")).toBe(11); // one day short
    expect(monthsOfService("2023-06-10", "2023-12-31")).toBe(6);
    expect(monthsOfService("2024-01-01", "2023-12-31")).toBe(0); // not yet joined
  });
});

describe("activeMonthsInYear", () => {
  it("counts the join month through December", () => {
    expect(activeMonthsInYear("2022-01-01", 2023)).toBe(12); // joined before
    expect(activeMonthsInYear("2023-06-10", 2023)).toBe(7); // Jun..Dec
    expect(activeMonthsInYear("2024-01-01", 2023)).toBe(0); // joined after
  });
});

describe("annualEntitlement", () => {
  it("grants the full year for a full-year employee (lump)", () => {
    expect(annualEntitlement(LUMP, "2022-01-01", 2023)).toBe(12);
  });

  it("prorates by join month", () => {
    // joined July → 6 active months → 12 * 6/12 = 6
    expect(annualEntitlement(LUMP, "2023-07-01", 2023)).toBe(6);
    // joined Oct → 3 active months → 3
    expect(annualEntitlement(LUMP, "2023-10-01", 2023)).toBe(3);
  });

  it("grants 0 until the minimum-service gate is met", () => {
    // statutory 12-month gate, joined mid-year → <12 months by year end → 0
    expect(annualEntitlement(STATUTORY, "2023-07-01", 2023)).toBe(0);
    // joined the prior year → gate met → full 12
    expect(annualEntitlement(STATUTORY, "2022-01-01", 2023)).toBe(12);
  });
});

describe("accruedAsOf (monthly)", () => {
  it("credits one-twelfth at each month-end", () => {
    expect(accruedAsOf(MONTHLY, "2023-01-01", "2023-01-31")).toBe(1);
    expect(accruedAsOf(MONTHLY, "2023-01-01", "2023-06-30")).toBe(6);
    expect(accruedAsOf(MONTHLY, "2023-01-01", "2023-06-15")).toBe(5); // June not yet ended
    expect(accruedAsOf(MONTHLY, "2023-01-01", "2023-12-31")).toBe(12);
  });

  it("starts accrual from the join month for mid-year joiners", () => {
    expect(accruedAsOf(MONTHLY, "2023-07-01", "2023-12-31")).toBe(6);
  });

  it("lump method makes the full prorated grant available immediately", () => {
    expect(accruedAsOf(LUMP, "2023-07-01", "2023-07-02")).toBe(6);
  });
});

describe("carryOver", () => {
  it("caps unused days at the policy max", () => {
    expect(carryOver(LUMP, 9)).toBe(6); // cap 6
    expect(carryOver(LUMP, 4)).toBe(4);
    expect(carryOver(LUMP, 0)).toBe(0);
    expect(carryOver(LUMP, -3)).toBe(0);
  });
});

describe("countLeaveDays", () => {
  it("excludes weekends on a 5-day week", () => {
    // 2024-03-04 (Mon) .. 2024-03-08 (Fri) = 5 working days
    expect(countLeaveDays("2024-03-04", "2024-03-08")).toBe(5);
    // Mon..Sun spanning a weekend = still 5
    expect(countLeaveDays("2024-03-04", "2024-03-10")).toBe(5);
  });

  it("includes Saturday on a 6-day week", () => {
    expect(countLeaveDays("2024-03-04", "2024-03-09", { workweekDays: 6 })).toBe(6);
  });

  it("excludes public holidays", () => {
    expect(countLeaveDays("2024-03-04", "2024-03-08", { holidays: ["2024-03-06"] })).toBe(4);
  });

  it("handles half-day single-day requests", () => {
    expect(countLeaveDays("2024-03-04", "2024-03-04", { halfDay: true })).toBe(0.5);
    expect(() => countLeaveDays("2024-03-04", "2024-03-05", { halfDay: true })).toThrow();
  });

  it("throws when the range is reversed", () => {
    expect(() => countLeaveDays("2024-03-08", "2024-03-04")).toThrow();
  });
});

describe("availableBalance", () => {
  it("nets opening + accrued − used − pending", () => {
    expect(availableBalance({ openingBalance: 6, accrued: 5, used: 3, pending: 1 })).toBe(7);
    expect(availableBalance({ openingBalance: 0, accrued: 2.5, used: 0 })).toBe(2.5);
  });
});

describe("validateLeaveRequest", () => {
  it("accepts a valid paid request within balance", () => {
    expect(
      validateLeaveRequest({ startDate: "2024-03-04", endDate: "2024-03-06", requestedDays: 3, available: 5, paid: true }),
    ).toEqual({ ok: true, errors: [] });
  });

  it("rejects insufficient balance for paid leave", () => {
    const r = validateLeaveRequest({ startDate: "2024-03-04", endDate: "2024-03-08", requestedDays: 5, available: 2, paid: true });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/saldo/i);
  });

  it("does not draw down balance for unpaid leave", () => {
    const r = validateLeaveRequest({ startDate: "2024-03-04", endDate: "2024-03-08", requestedDays: 5, available: 0, paid: false });
    expect(r.ok).toBe(true);
  });

  it("rejects a reversed date range", () => {
    const r = validateLeaveRequest({ startDate: "2024-03-08", endDate: "2024-03-04", requestedDays: 1, available: 5, paid: true });
    expect(r.ok).toBe(false);
  });
});

describe("roundHalfDay", () => {
  it("rounds to the nearest 0.5", () => {
    expect(roundHalfDay(2.4)).toBe(2.5);
    expect(roundHalfDay(2.24)).toBe(2);
    expect(roundHalfDay(2.75)).toBe(3); // 2.75*2=5.5 → round 6 → /2 = 3
  });
});
