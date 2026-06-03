/**
 * @nexis/money — integer rupiah helpers.
 *
 * RULE (see AGENTS.md): all money in Nexis is whole rupiah stored as a JS number
 * representing an integer amount (backed by Postgres `bigint`). NEVER use floats
 * for money math. These helpers centralise rounding and formatting so the rest of
 * the codebase never improvises.
 */

/** A whole-rupiah amount. Always an integer. */
export type Rupiah = number;

/** Indonesian Rupiah has no sub-unit in practice; we round to whole rupiah. */
export function toRupiah(value: number): Rupiah {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return Math.round(value);
}

/** Add a list of rupiah amounts safely (rounds the result). */
export function sum(...amounts: Rupiah[]): Rupiah {
  return toRupiah(amounts.reduce((acc, a) => acc + a, 0));
}

/** Subtract b from a (rounds the result). */
export function subtract(a: Rupiah, b: Rupiah): Rupiah {
  return toRupiah(a - b);
}

/**
 * Apply a percentage expressed in basis points (1% = 100 bps).
 * e.g. percentBps(10_000_000, 100) => 100_000  (1% of 10,000,000)
 * Rounds to whole rupiah.
 */
export function percentBps(base: Rupiah, bps: number): Rupiah {
  return toRupiah((base * bps) / 10_000);
}

/** Clamp a base amount to a ceiling (used for BPJS wage caps). */
export function capAt(base: Rupiah, ceiling: Rupiah): Rupiah {
  return Math.min(base, ceiling);
}

/**
 * Format a rupiah amount for display, e.g. 1250000 => "Rp 1.250.000".
 * Uses Indonesian grouping (dot thousands separator).
 */
export function formatRupiah(amount: Rupiah, opts: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = opts;
  const formatted = new Intl.NumberFormat("id-ID").format(toRupiah(amount));
  return withSymbol ? `Rp ${formatted}` : formatted;
}

/** Parse a user-entered rupiah string ("Rp 1.250.000" or "1250000") to an integer. */
export function parseRupiah(input: string): Rupiah {
  const digits = input.replace(/[^0-9-]/g, "");
  if (digits === "" || digits === "-") return 0;
  return toRupiah(Number(digits));
}
