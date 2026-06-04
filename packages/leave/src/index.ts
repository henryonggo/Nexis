/**
 * @nexis/leave — pure, framework-free leave-balance engine.
 *
 * Stage 5 (see docs/stages/stage-05-leave-claims.md). Like @nexis/payroll this
 * is dependency-free, deterministic, and unit-tested; the app and any worker
 * inject policy + dates and read balances out. No DB, no I/O.
 *
 * RULES:
 *  - Days are numbers in 0.5 increments (half-day leave is common in ID).
 *  - Dates are ISO `YYYY-MM-DD` strings interpreted in UTC (no tz drift on a
 *    date-only value).
 *  - Functions are pure and deterministic; rounding is explicit.
 *
 * Indonesian context (UU Ketenagakerjaan / UU Cipta Kerja): statutory annual
 * leave (cuti tahunan) is 12 days, with entitlement after 12 months of
 * continuous service. Companies commonly prorate and set carry-over caps, so the
 * *numbers* are policy inputs — only the method lives here.
 */

/** How a year's entitlement is granted. */
export type AccrualMethod =
  /** Earn annualDays/12 each completed month of the calendar year. */
  | "monthly"
  /** Whole annualDays granted up front for the year (prorated by join month). */
  | "annual_lump";

export interface LeavePolicy {
  /** Full-year entitlement in days, e.g. 12. */
  annualDays: number;
  accrualMethod: AccrualMethod;
  /** Months of continuous service required before any leave accrues (statutory: 12). */
  minServiceMonths: number;
  /** Max unused days that carry into the next year (0 = no carry-over). */
  maxCarryOverDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` string to a UTC Date at midnight. Throws if malformed. */
export function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid date "${iso}" (expected YYYY-MM-DD)`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date "${iso}"`);
  return d;
}

/** Whole months of service completed between `joinDate` and `asOf` (inclusive of day-of-month). */
export function monthsOfService(joinDate: string, asOf: string): number {
  const join = parseDate(joinDate);
  const at = parseDate(asOf);
  if (at < join) return 0;
  let months =
    (at.getUTCFullYear() - join.getUTCFullYear()) * 12 +
    (at.getUTCMonth() - join.getUTCMonth());
  // Not a *completed* month until the day-of-month is reached.
  if (at.getUTCDate() < join.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Round to the nearest half-day (leave is granted/used in 0.5 increments). */
export function roundHalfDay(days: number): number {
  return Math.round(days * 2) / 2;
}

/**
 * Months the employee is active during `year` (1–12). Joined before the year →
 * 12; joined during the year → counts the join month through December; joined
 * after the year → 0.
 */
export function activeMonthsInYear(joinDate: string, year: number): number {
  const join = parseDate(joinDate);
  if (join.getUTCFullYear() > year) return 0;
  if (join.getUTCFullYear() < year) return 12;
  return 12 - join.getUTCMonth(); // join month counts as active
}

/**
 * Entitlement granted for a full calendar `year`, prorated by join month and
 * gated by the minimum-service rule (evaluated at year end). For `monthly`
 * accrual this is the year-end total; use `accruedAsOf` for mid-year balances.
 */
export function annualEntitlement(
  policy: LeavePolicy,
  joinDate: string,
  year: number,
): number {
  const yearEnd = `${year}-12-31`;
  if (monthsOfService(joinDate, yearEnd) < policy.minServiceMonths) return 0;

  const activeMonths = activeMonthsInYear(joinDate, year);
  if (activeMonths <= 0) return 0;

  if (policy.accrualMethod === "annual_lump") {
    return activeMonths >= 12 ? policy.annualDays : roundHalfDay((policy.annualDays * activeMonths) / 12);
  }
  // monthly
  return roundHalfDay((policy.annualDays * activeMonths) / 12);
}

/**
 * Days accrued from the start of `asOf`'s year up to and including `asOf`.
 * For `monthly` accrual, only *completed* months in the year count. For
 * `annual_lump`, the whole (prorated) year's grant is available once the
 * min-service gate is met.
 */
export function accruedAsOf(policy: LeavePolicy, joinDate: string, asOf: string): number {
  const at = parseDate(asOf);
  const year = at.getUTCFullYear();
  if (monthsOfService(joinDate, asOf) < policy.minServiceMonths) return 0;

  if (policy.accrualMethod === "annual_lump") {
    return annualEntitlement(policy, joinDate, year);
  }

  // monthly: credit at each month-end. The join month counts in full (like
  // activeMonthsInYear), so completed = months from the start month to asOf,
  // plus one when asOf falls on a month-end.
  const join = parseDate(joinDate);
  const startMonth = join.getUTCFullYear() === year ? join.getUTCMonth() : 0;
  const lastDayOfAtMonth = new Date(Date.UTC(year, at.getUTCMonth() + 1, 0)).getUTCDate();
  const isMonthEnd = at.getUTCDate() === lastDayOfAtMonth;
  let completed = at.getUTCMonth() - startMonth + (isMonthEnd ? 1 : 0);
  completed = Math.max(0, Math.min(completed, activeMonthsInYear(joinDate, year)));
  return roundHalfDay((policy.annualDays / 12) * completed);
}

/** Carry-over into the next year: unused balance capped by policy. */
export function carryOver(policy: LeavePolicy, unusedDays: number): number {
  if (unusedDays <= 0) return 0;
  return Math.min(roundHalfDay(unusedDays), policy.maxCarryOverDays);
}

/**
 * Count chargeable leave days in the inclusive range [startDate, endDate],
 * excluding weekends (per workweek length) and public holidays. `halfDay` only
 * applies to a single-day request.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  opts: { workweekDays?: 5 | 6; holidays?: readonly string[]; halfDay?: boolean } = {},
): number {
  const { workweekDays = 5, holidays = [], halfDay = false } = opts;
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (end < start) throw new Error("endDate is before startDate");

  const holidaySet = new Set(holidays);
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    const d = new Date(t);
    const dow = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dow === 0) continue; // Sunday always off
    if (dow === 6 && workweekDays === 5) continue; // Saturday off on 5-day week
    const iso = d.toISOString().slice(0, 10);
    if (holidaySet.has(iso)) continue;
    count += 1;
  }

  if (halfDay) {
    if (startDate !== endDate) throw new Error("halfDay only valid for a single-day request");
    return count === 0 ? 0 : 0.5;
  }
  return count;
}

export interface BalanceInputs {
  /** Carried-over days from the prior year. */
  openingBalance: number;
  /** Days accrued/granted this year so far. */
  accrued: number;
  /** Days already taken (approved). */
  used: number;
  /** Days in approved-but-not-yet-taken / pending requests, if reserving. */
  pending?: number;
}

/** Available balance = opening + accrued − used − pending. */
export function availableBalance(b: BalanceInputs): number {
  return roundHalfDay(b.openingBalance + b.accrued - b.used - (b.pending ?? 0));
}

export interface LeaveRequestValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a leave request against dates and available balance. Overlap with
 * existing requests is a DB-level check (needs other rows) and is out of scope
 * here — the caller does that against `leave_requests`.
 */
export function validateLeaveRequest(args: {
  startDate: string;
  endDate: string;
  requestedDays: number;
  available: number;
  paid: boolean;
}): LeaveRequestValidation {
  const errors: string[] = [];
  const start = parseDate(args.startDate);
  const end = parseDate(args.endDate);

  if (end < start) errors.push("Tanggal selesai sebelum tanggal mulai.");
  if (args.requestedDays <= 0) errors.push("Durasi cuti harus lebih dari 0 hari.");
  // Only paid leave draws down a balance; unpaid/sick-with-cert may not.
  if (args.paid && args.requestedDays > args.available) {
    errors.push(
      `Saldo cuti tidak mencukupi (diminta ${args.requestedDays}, tersedia ${args.available}).`,
    );
  }
  return { ok: errors.length === 0, errors };
}
