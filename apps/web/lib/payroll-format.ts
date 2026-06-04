// Client-safe payroll display helpers (no server-only imports) so client
// components like the run wizard can use them. Server-side payroll logic lives
// in lib/payroll.ts and re-exports these.
import { formatRupiah } from "@nexis/money";

/** Indonesian month names for run labels. */
export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export function formatPeriod(year: number, month: number): string {
  return `${MONTH_NAMES_ID[month - 1] ?? month} ${year}`;
}

export { formatRupiah };
