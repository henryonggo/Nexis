/**
 * Weekly work schedule — the days of the week an employee is *expected* to work.
 *
 * This replaces the old "working days per month" number: instead of a count, the
 * schedule is the set of weekdays (Mon–Sun) someone is rostered for. The expected
 * working days in a given month is then derived by counting matching dates, and
 * an expected day with no attendance is an absence the admin can deduct for.
 *
 * Weekdays are stored as ISO numbers (1 = Monday … 7 = Sunday) so the set is
 * stable and human-readable in the DB. Pure + framework-free so the settings UI,
 * the employee form, and the payroll engine all share one definition.
 */

export interface WeekdayMeta {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  iso: number;
  /** i18n key under `weekdays.*`. */
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

/** Count of expected workdays in a calendar month for the schedule. */
export function expectedWorkdaysInMonth(
  workDays: number[],
  year: number,
  month: number,
): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate(); // last day of month
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const iso = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (workDays.includes(iso === 0 ? 7 : iso)) count++;
  }
  return count;
}
