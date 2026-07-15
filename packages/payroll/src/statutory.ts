/**
 * Shared statutory-reference helpers (NEXT-1: "one statutory source").
 *
 * These are the small, pure building blocks both the run preview
 * (apps/web/lib/payroll.ts) and the agent tools
 * (packages/agent-tools/src/tools/statutory.ts) use to interpret
 * reference-table rows and JSON blobs: valid PTKP/JKK enumerations, the
 * "in force on this date" predicate for effective-dated rows, the
 * fixed_allowances JSON-blob summer, and period-boundary date strings.
 * Moved here (rather than duplicated) so both callers provably apply the
 * same rules.
 */
import type { Rupiah } from "@nexis/money";
import type { JkkRiskClass, PtkpStatus } from "./index";

export const PTKP_STATUSES = new Set<PtkpStatus>([
  "TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3",
]);
export const JKK_RISK_CLASSES = new Set<JkkRiskClass>([
  "very_low", "low", "medium", "high", "very_high",
]);

export function periodStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function periodEnd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Reference row is in force on `date` (YYYY-MM-DD, inclusive bounds). */
export function effectiveOn<T extends { effective_from: string; effective_to: string | null }>(
  rows: T[],
  date: string,
): T[] {
  return rows.filter(
    (r) => r.effective_from <= date && (r.effective_to == null || r.effective_to >= date),
  );
}

/** Sum a compensation.fixed_allowances JSON blob (number | {amount}[] | map). */
export function sumFixedAllowances(value: unknown): Rupiah {
  if (typeof value === "number") return Math.round(value);
  if (Array.isArray(value)) {
    return value.reduce<number>((acc, item) => {
      const amount =
        typeof item === "number" ? item : Number((item as { amount?: unknown })?.amount ?? 0);
      return acc + (Number.isFinite(amount) ? Math.round(amount) : 0);
    }, 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>((acc, v) => {
      const amount = Number(v);
      return acc + (Number.isFinite(amount) ? Math.round(amount) : 0);
    }, 0);
  }
  return 0;
}
