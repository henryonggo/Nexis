/**
 * Weekly work schedule + workday-calendar helpers (NEXT-1 "one statutory
 * source", NEXT-5 mid-month-hire proration — ADR 0006).
 *
 * The weekly schedule is the set of weekdays (Mon–Sun) an employee is
 * *expected* to work, stored as ISO weekday numbers (1 = Monday … 7 = Sunday)
 * so it is stable and human-readable in the DB. Everything here is pure and
 * framework-free — no DB, no `Date`-object mutation, no locale — so the
 * agent-tools statutory computation can depend on it deterministically.
 *
 * This is a copy of the pure calendar pieces of `apps/web/lib/work-schedule.ts`
 * (settings UI + employee form + the interactive run preview), moved here so
 * the mid-month-hire proration (packages/agent-tools) has ONE definition to
 * import rather than re-deriving the calendar math. `apps/web` is outside
 * this package's lane (see AGENTS.md / docs/08-agent-boundaries.md) so its
 * copy was NOT deleted or repointed at this module — ADR 0006 flags the
 * resulting duplication as a follow-up for whoever owns that seam.
 */
import { type Rupiah, toRupiah } from "@nexis/money";

export interface WeekdayMeta {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  iso: number;
  /** i18n key under `weekdays.*` (apps/web only; unused here). */
  key: string;
}

/** The seven weekdays in display order, Monday first (Indonesian/most-of-world). */
export const WEEKDAYS: WeekdayMeta[] = [
  { iso: 1, key: "mon" },
  { iso: 2, key: "tue" },
  { iso: 3, key: "wed" },
  { iso: 4, key: "thu" },
  { iso: 5, key: "fri" },
  { iso: 6, key: "sat" },
  { iso: 7, key: "sun" },
];

/** Default schedule: Monday–Friday. */
export const DEFAULT_WORK_DAYS: number[] = [1, 2, 3, 4, 5];

/**
 * Coerce a stored value (int[] / string[] / JSON) into a clean, sorted, deduped
 * ISO-weekday set. Invalid or empty input falls back to the Mon–Fri default so a
 * schedule is never silently empty (which would zero out all pay).
 */
export function normalizeWorkDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_WORK_DAYS];
  const set = new Set<number>();
  for (const v of value) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  }
  if (set.size === 0) return [...DEFAULT_WORK_DAYS];
  return [...set].sort((a, b) => a - b);
}

/** ISO weekday (1–7) for a YYYY-MM-DD date, using UTC to avoid TZ drift. */
export function isoWeekday(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sun … 6 = Sat
  return day === 0 ? 7 : day;
}

/** Whether a YYYY-MM-DD date falls on an expected workday for the schedule. */
export function isExpectedWorkday(workDays: number[], dateStr: string): boolean {
  return workDays.includes(isoWeekday(dateStr));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Count of expected workdays in a calendar month for the schedule. */
export function expectedWorkdaysInMonth(workDays: number[], year: number, month: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate(); // last day of month
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const iso = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (workDays.includes(iso === 0 ? 7 : iso)) count++;
  }
  return count;
}

/**
 * Count of expected workdays from `fromDate` (inclusive) through the last day
 * of (year, month) — the mid-month-hire proration numerator (ADR 0006).
 * Dates before the 1st of (year, month) count the whole month; a `fromDate`
 * after the month's last day returns 0 (hired after the period ends).
 * String comparison is safe because both sides are zero-padded YYYY-MM-DD.
 */
export function expectedWorkdaysFrom(
  workDays: number[],
  fromDate: string,
  year: number,
  month: number,
): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    if (dateStr < fromDate) continue;
    const iso = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (workDays.includes(iso === 0 ? 7 : iso)) count++;
  }
  return count;
}

/**
 * Working-day-basis mid-month-hire proration factor (ADR 0006): the ratio of
 * expected working days from the hire date through the period end, over
 * expected working days in the whole period month, using the employee's
 * weekly schedule (own `work_days` override, else the company default).
 *
 * Returned as a `{ workedDays, totalDays }` pair rather than a float so
 * `prorateByFactor` can multiply-then-round exactly once (integer rupiah,
 * never compounding rounding across two divisions).
 */
export interface HireProrationFactor {
  /** Expected working days from the hire date through the period end. */
  workedDays: number;
  /** Expected working days in the whole period month. */
  totalDays: number;
}

export function hireProrationFactor(
  workDays: number[],
  hireDate: string,
  year: number,
  month: number,
): HireProrationFactor {
  return {
    workedDays: expectedWorkdaysFrom(workDays, hireDate, year, month),
    totalDays: expectedWorkdaysInMonth(workDays, year, month),
  };
}

/**
 * Prorate a whole-rupiah amount by a `HireProrationFactor`, rounding once
 * (never round-then-multiply). `totalDays <= 0` (a misconfigured empty
 * schedule) prorates to 0 rather than dividing by zero — `normalizeWorkDays`
 * already prevents an empty schedule from reaching here in practice.
 */
export function prorateByFactor(amount: Rupiah, factor: HireProrationFactor): Rupiah {
  if (factor.totalDays <= 0) return 0;
  return toRupiah((amount * factor.workedDays) / factor.totalDays);
}
