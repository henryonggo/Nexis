/**
 * @nexis/payroll — reference-table → engine config loaders.
 *
 * Pure mappers that turn rows from the Supabase reference tables (ter_rates,
 * tax_brackets, ptkp_rates, bpjs_config) into the engine's `PayrollConfig` /
 * `AnnualTaxConfig` / `TerRateRow[]`. They do NOT touch the Supabase client —
 * the caller (web server action or the Cloud Run worker) fetches the
 * effective-dated rows and hands the arrays in. Keeping this pure means it is
 * the same code path that builds a run's `config_snapshot` and can be replayed
 * to reproduce a historical run (acceptance criterion #5).
 *
 * RULES (mirror index.ts): integer rupiah, deterministic, no hardcoded rates —
 * every number comes from the rows passed in. The only constants here are
 * statutory *method* parameters (biaya jabatan rate/cap per UU HPP) that the
 * schema does not model as reference rows; they are overridable.
 */
import type { Rupiah } from "@nexis/money";
import {
  buildTerLookup,
  type AnnualTaxConfig,
  type JkkRiskClass,
  type PayrollConfig,
  type ProgressiveBracket,
  type PtkpStatus,
  type TerCategory,
  type TerRateRow,
} from "./index";

// ── Row shapes (structural subset of @nexis/types Database rows) ────────────
// Declared locally so the pure engine package stays dependency-free; they match
// the generated `*.Row` types field-for-field on the columns we read.

/** Subset of `bpjs_config.Row`. */
export interface BpjsConfigRow {
  key: string;
  rate_bps: number | null;
  amount: number | null;
}

/** Subset of `ter_rates.Row`. */
export interface TerRateDbRow {
  category: string;
  income_lower: number;
  rate_bps: number;
}

/** Subset of `ptkp_rates.Row`. */
export interface PtkpRateRow {
  status: string;
  annual_amount: number;
}

/** Subset of `tax_brackets.Row`. */
export interface TaxBracketRow {
  lower_bound: number;
  upper_bound: number | null;
  rate_bps: number;
}

/** Statutory biaya jabatan defaults (UU HPP): 5% of gross, capped 6,000,000/yr. */
export const BIAYA_JABATAN_RATE_BPS = 500;
export const BIAYA_JABATAN_ANNUAL_CAP: Rupiah = 6_000_000;

const PTKP_STATUSES: readonly PtkpStatus[] = [
  "TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3",
];

const JKK_RISK_CLASSES: readonly JkkRiskClass[] = [
  "very_low", "low", "medium", "high", "very_high",
];

function isTerCategory(value: string): value is TerCategory {
  return value === "A" || value === "B" || value === "C";
}

function isPtkpStatus(value: string): value is PtkpStatus {
  return (PTKP_STATUSES as readonly string[]).includes(value);
}

/**
 * Build a keyed accessor over `bpjs_config` rows. The seed models each rate /
 * cap / per-risk JKK rate as a single row keyed by e.g. `kes_employee`,
 * `kes_cap`, `jkk_medium`. Missing keys throw — a misconfigured reference set
 * must fail loudly rather than silently zero out a contribution.
 */
function bpjsAccessor(rows: BpjsConfigRow[]) {
  const byKey = new Map<string, BpjsConfigRow>();
  for (const row of rows) byKey.set(row.key, row);

  const get = (key: string): BpjsConfigRow => {
    const row = byKey.get(key);
    if (!row) throw new Error(`bpjs_config missing key "${key}"`);
    return row;
  };
  return {
    rateBps(key: string): number {
      const { rate_bps } = get(key);
      if (rate_bps == null) throw new Error(`bpjs_config "${key}" has no rate_bps`);
      return rate_bps;
    },
    amount(key: string): Rupiah {
      const { amount } = get(key);
      if (amount == null) throw new Error(`bpjs_config "${key}" has no amount`);
      return amount;
    },
  };
}

/**
 * Map `bpjs_config` + `ter_rates` rows → a `PayrollConfig` for the monthly
 * (TER) path. Pass rows already filtered to the run's effective date.
 */
export function buildPayrollConfig(
  bpjsRows: BpjsConfigRow[],
  terRows: TerRateDbRow[],
): PayrollConfig {
  const bpjs = bpjsAccessor(bpjsRows);

  const jkkEmployerBpsByRisk = Object.fromEntries(
    JKK_RISK_CLASSES.map((risk) => [risk, bpjs.rateBps(`jkk_${risk}`)]),
  ) as Record<JkkRiskClass, number>;

  return {
    bpjsKesEmployeeBps: bpjs.rateBps("kes_employee"),
    bpjsKesEmployerBps: bpjs.rateBps("kes_employer"),
    jhtEmployeeBps: bpjs.rateBps("jht_employee"),
    jhtEmployerBps: bpjs.rateBps("jht_employer"),
    jpEmployeeBps: bpjs.rateBps("jp_employee"),
    jpEmployerBps: bpjs.rateBps("jp_employer"),
    jkmEmployerBps: bpjs.rateBps("jkm_employer"),
    jkkEmployerBpsByRisk,
    bpjsKesCap: bpjs.amount("kes_cap"),
    jpCap: bpjs.amount("jp_cap"),
    terRateBps: buildTerLookup(toTerRateRows(terRows)),
  };
}

/** Map `ter_rates` rows → the engine's `TerRateRow[]` (income_lower → minGross). */
export function toTerRateRows(rows: TerRateDbRow[]): TerRateRow[] {
  return rows.map((row) => {
    if (!isTerCategory(row.category)) {
      throw new Error(`ter_rates has unknown category "${row.category}"`);
    }
    return { category: row.category, minGross: row.income_lower, rateBps: row.rate_bps };
  });
}

/**
 * Map `ptkp_rates` + `tax_brackets` rows → an `AnnualTaxConfig` for December
 * reconciliation. Biaya jabatan rate/cap default to the statutory values but
 * can be overridden if the schema ever models them as reference rows.
 */
export function buildAnnualTaxConfig(
  ptkpRows: PtkpRateRow[],
  bracketRows: TaxBracketRow[],
  opts: { biayaJabatanRateBps?: number; biayaJabatanAnnualCap?: Rupiah } = {},
): AnnualTaxConfig {
  const ptkpAnnualByStatus = {} as Record<PtkpStatus, Rupiah>;
  for (const row of ptkpRows) {
    if (!isPtkpStatus(row.status)) {
      throw new Error(`ptkp_rates has unknown status "${row.status}"`);
    }
    ptkpAnnualByStatus[row.status] = row.annual_amount;
  }
  for (const status of PTKP_STATUSES) {
    if (ptkpAnnualByStatus[status] == null) {
      throw new Error(`ptkp_rates missing status "${status}"`);
    }
  }

  return {
    ptkpAnnualByStatus,
    brackets: toProgressiveBrackets(bracketRows),
    biayaJabatanRateBps: opts.biayaJabatanRateBps ?? BIAYA_JABATAN_RATE_BPS,
    biayaJabatanAnnualCap: opts.biayaJabatanAnnualCap ?? BIAYA_JABATAN_ANNUAL_CAP,
  };
}

/**
 * Map `tax_brackets` rows → ascending `ProgressiveBracket[]`. The open-ended top
 * bracket (`upper_bound = null`) becomes `upTo: null`. Bounds in the seed are
 * inclusive-exclusive expressed as e.g. `60000000` / `60000001`; the engine's
 * `progressiveTax` slices on the upper bound, so we carry `upper_bound` through
 * directly (each row's `upTo` is its own inclusive ceiling).
 */
export function toProgressiveBrackets(rows: TaxBracketRow[]): ProgressiveBracket[] {
  return [...rows]
    .sort((a, b) => a.lower_bound - b.lower_bound)
    .map((row) => ({ upTo: row.upper_bound, rateBps: row.rate_bps }));
}
