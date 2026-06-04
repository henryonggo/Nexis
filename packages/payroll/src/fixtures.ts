/**
 * Test fixtures for the payroll engine.
 *
 * ⚠️ The rate NUMBERS here are a **representative subset for deterministic unit
 * testing only** — they are NOT the authoritative production rates. The real
 * values live in the versioned reference tables seeded by Antigravity
 * (`ptkp_rates`, `tax_brackets`, `ter_rates`, `bpjs_config`) per
 * docs/05-indonesian-compliance.md, and must be re-verified against DJP/BPJS
 * regulations each tax year. The engine reads rates as injected config, so these
 * fixtures exercise the *method*, not the canonical table.
 */
import type {
  PayrollConfig,
  AnnualTaxConfig,
  TerRateRow,
  PtkpStatus,
} from "./index";
import { buildTerLookup } from "./index";

/**
 * Representative TER bands. Low bands (0% / 0.25%) mirror the real schedule; the
 * higher bands are chosen as round numbers so fixture outputs are hand-checkable.
 */
export const TER_RATES: TerRateRow[] = [
  // Category A (TK/0, TK/1, K/0)
  { category: "A", minGross: 0, rateBps: 0 },
  { category: "A", minGross: 5_400_000, rateBps: 25 }, // 0.25%
  { category: "A", minGross: 10_000_000, rateBps: 200 }, // 2%
  { category: "A", minGross: 20_000_000, rateBps: 500 }, // 5%
  // Category B (TK/2, TK/3, K/1, K/2)
  { category: "B", minGross: 0, rateBps: 0 },
  { category: "B", minGross: 6_000_000, rateBps: 25 },
  { category: "B", minGross: 12_000_000, rateBps: 300 }, // 3%
  // Category C (K/3)
  { category: "C", minGross: 0, rateBps: 0 },
  { category: "C", minGross: 7_000_000, rateBps: 50 },
  { category: "C", minGross: 15_000_000, rateBps: 400 }, // 4%
];

/** Monthly-run config snapshot used by fixtures (BPJS rates/caps from docs/05). */
export const MONTHLY_CONFIG: PayrollConfig = {
  bpjsKesEmployeeBps: 100, // 1%
  bpjsKesEmployerBps: 400, // 4%
  jhtEmployeeBps: 200, // 2%
  jhtEmployerBps: 370, // 3.7%
  jpEmployeeBps: 100, // 1%
  jpEmployerBps: 200, // 2%
  jkmEmployerBps: 30, // 0.30%
  jkkEmployerBpsByRisk: { very_low: 24, low: 54, medium: 89, high: 127, very_high: 174 },
  bpjsKesCap: 12_000_000,
  jpCap: 10_547_400,
  terRateBps: buildTerLookup(TER_RATES),
};

const PTKP_ANNUAL: Record<PtkpStatus, number> = {
  "TK/0": 54_000_000,
  "TK/1": 58_500_000,
  "TK/2": 63_000_000,
  "TK/3": 67_500_000,
  "K/0": 58_500_000,
  "K/1": 63_000_000,
  "K/2": 67_500_000,
  "K/3": 72_000_000,
};

/** Annual reconciliation config (UU HPP brackets + biaya jabatan, from docs/05). */
export const ANNUAL_CONFIG: AnnualTaxConfig = {
  ptkpAnnualByStatus: PTKP_ANNUAL,
  brackets: [
    { upTo: 60_000_000, rateBps: 500 }, // 5%
    { upTo: 250_000_000, rateBps: 1_500 }, // 15%
    { upTo: 500_000_000, rateBps: 2_500 }, // 25%
    { upTo: 5_000_000_000, rateBps: 3_000 }, // 30%
    { upTo: null, rateBps: 3_500 }, // 35%
  ],
  biayaJabatanRateBps: 500, // 5%
  biayaJabatanAnnualCap: 6_000_000, // 500k/month
};
