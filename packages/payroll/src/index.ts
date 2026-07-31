/**
 * @nexis/payroll — pure, framework-free Indonesian payroll engine.
 *
 * Implemented in full in Stage 4 (see docs/stages/stage-04-payroll.md and
 * docs/05-indonesian-compliance.md). This file establishes the type contract
 * and the deterministic skeleton so the Cloud Run worker and any estimator UI
 * can depend on a stable interface.
 *
 * RULES:
 *  - All money is integer rupiah via @nexis/money.
 *  - Rates are passed IN as config (snapshotted per run) — never hardcoded here.
 *  - Functions are pure and deterministic.
 */
import { type Rupiah, sum, subtract, percentBps, capAt, toRupiah } from "@nexis/money";

export type PtkpStatus =
  | "TK/0" | "TK/1" | "TK/2" | "TK/3"
  | "K/0" | "K/1" | "K/2" | "K/3";

export type JkkRiskClass = "very_low" | "low" | "medium" | "high" | "very_high";

/** Rate configuration snapshot for one payroll run (loaded from reference tables). */
export interface PayrollConfig {
  // BPJS rates in basis points
  bpjsKesEmployeeBps: number; // 100  = 1%
  bpjsKesEmployerBps: number; // 400  = 4%
  jhtEmployeeBps: number; // 200  = 2%
  jhtEmployerBps: number; // 370  = 3.7%
  jpEmployeeBps: number; // 100  = 1%
  jpEmployerBps: number; // 200  = 2%
  jkmEmployerBps: number; // 30   = 0.30%
  jkkEmployerBpsByRisk: Record<JkkRiskClass, number>; // very_low: 24, ...
  // Wage caps (whole rupiah)
  bpjsKesCap: Rupiah;
  jpCap: Rupiah;
  // PPh 21 TER lookup: returns effective rate in bps for a (category, gross)
  terRateBps: (status: PtkpStatus, grossMonthly: Rupiah) => number;
}

/**
 * Snapshot of the rate config used for one payroll run — the exact shape
 * persisted to `payroll_runs.config_snapshot` (both the create_draft_payroll_run
 * tool and the legacy computeRunPreview action write it) and read by the Cloud
 * Run worker to reproduce that run's numbers later (Stage 4 AC #5).
 *
 * `config` omits `terRateBps`: a function cannot survive JSON storage, so
 * readers rebuild the TER lookup from the `ter_rates` rows in force on
 * `effectiveDate` (see `buildPayrollConfig`) rather than reading it off the
 * snapshot.
 */
export interface PayrollConfigSnapshot {
  /** YYYY-MM-DD the rate rows were resolved on. */
  effectiveDate: string;
  runType: "monthly" | "thr";
  config: Omit<PayrollConfig, "terRateBps">;
}

export interface EmployeePayrollInput {
  baseSalary: Rupiah;
  fixedAllowances: Rupiah;
  overtimePay: Rupiah;
  variableEarnings?: Rupiah;
  ptkpStatus: PtkpStatus;
  hasNpwp: boolean;
  jkkRiskClass: JkkRiskClass;
  bpjsKesEnrolled: boolean;
  jhtEnrolled: boolean;
  jpEnrolled: boolean;
}

export interface PayrollResult {
  gross: Rupiah;
  bpjsKesEmployee: Rupiah;
  bpjsKesEmployer: Rupiah;
  jhtEmployee: Rupiah;
  jhtEmployer: Rupiah;
  jpEmployee: Rupiah;
  jpEmployer: Rupiah;
  jkkEmployer: Rupiah;
  jkmEmployer: Rupiah;
  pph21: Rupiah;
  terRateBps: number;
  netPay: Rupiah;
}

const NO_NPWP_SURCHARGE_BPS = 12_000; // 120% => multiply by 1.20

/**
 * Compute one employee's monthly payroll (Jan–Nov TER method).
 * December reconciliation (progressive brackets) is implemented separately in
 * Stage 4 — this covers the standard monthly path.
 */
export function computeMonthlyPayroll(
  input: EmployeePayrollInput,
  cfg: PayrollConfig,
): PayrollResult {
  const gross = sum(
    input.baseSalary,
    input.fixedAllowances,
    input.overtimePay,
    input.variableEarnings ?? 0,
  );

  const kesBase = capAt(input.baseSalary, cfg.bpjsKesCap);
  const jpBase = capAt(input.baseSalary, cfg.jpCap);

  const bpjsKesEmployee = input.bpjsKesEnrolled ? percentBps(kesBase, cfg.bpjsKesEmployeeBps) : 0;
  const bpjsKesEmployer = input.bpjsKesEnrolled ? percentBps(kesBase, cfg.bpjsKesEmployerBps) : 0;
  const jhtEmployee = input.jhtEnrolled ? percentBps(input.baseSalary, cfg.jhtEmployeeBps) : 0;
  const jhtEmployer = input.jhtEnrolled ? percentBps(input.baseSalary, cfg.jhtEmployerBps) : 0;
  const jpEmployee = input.jpEnrolled ? percentBps(jpBase, cfg.jpEmployeeBps) : 0;
  const jpEmployer = input.jpEnrolled ? percentBps(jpBase, cfg.jpEmployerBps) : 0;
  const jkkEmployer = percentBps(input.baseSalary, cfg.jkkEmployerBpsByRisk[input.jkkRiskClass]);
  const jkmEmployer = percentBps(input.baseSalary, cfg.jkmEmployerBps);

  const terRateBps = cfg.terRateBps(input.ptkpStatus, gross);
  let pph21 = percentBps(gross, terRateBps);
  if (!input.hasNpwp) {
    pph21 = percentBps(pph21, NO_NPWP_SURCHARGE_BPS);
  }

  const employeeDeductions = sum(bpjsKesEmployee, jhtEmployee, jpEmployee, pph21);
  const netPay = subtract(gross, employeeDeductions);

  return {
    gross,
    bpjsKesEmployee,
    bpjsKesEmployer,
    jhtEmployee,
    jhtEmployer,
    jpEmployee,
    jpEmployer,
    jkkEmployer,
    jkmEmployer,
    pph21,
    terRateBps,
    netPay,
  };
}

/** Overtime hourly base = 1/173 × monthly wage (UU Cipta Kerja / Kepmenaker). */
export function overtimeHourlyBase(monthlyWage: Rupiah): Rupiah {
  return Math.round(monthlyWage / 173);
}

// ───────────────────────────────────────────────────────────────────────────
// Pay frequency → earned base salary (working-days model).
// A company sets a standard working-days figure; daily-paid people earn per day
// attended, and "mixed" people earn a fixed monthly base PLUS a per-day rate.
// Pure + deterministic so the run preview (apps/web) and the worker (services)
// agree to the rupiah. Conversions between monthly and daily go through the
// working-days figure (monthly = daily × workingDays; daily = monthly ÷ workingDays).
// ───────────────────────────────────────────────────────────────────────────

export type PayFrequency = "monthly" | "daily" | "mixed";

export interface EarnedBaseInput {
  payFrequency: PayFrequency;
  /** Monthly base salary (whole rupiah). Used by "monthly" and "mixed". */
  monthlyBase: Rupiah;
  /**
   * Per-day rate (whole rupiah). Used by "mixed". For "daily", the daily rate is
   * carried in `monthlyBase` (legacy: daily-paid `compensation.base_salary` is the
   * daily rate) when `dailyRate` is omitted.
   */
  dailyRate?: Rupiah;
  /** Unique days attended in the period (drives the per-day portion). */
  daysWorked: number;
}

/**
 * Base salary actually earned in a period, by pay frequency:
 *  - `monthly` → the full monthly base (attendance affects nothing here).
 *  - `daily`   → dailyRate × daysWorked (dailyRate defaults to monthlyBase for
 *               backward compatibility with existing daily-paid records).
 *  - `mixed`   → monthlyBase + dailyRate × daysWorked (the two-box model).
 */
export function computeEarnedBase(input: EarnedBaseInput): Rupiah {
  const days = Math.max(0, input.daysWorked);
  switch (input.payFrequency) {
    case "monthly":
      return toRupiah(input.monthlyBase);
    case "daily": {
      const rate = input.dailyRate ?? input.monthlyBase;
      return toRupiah(rate * days);
    }
    case "mixed": {
      const rate = input.dailyRate ?? 0;
      return sum(input.monthlyBase, toRupiah(rate * days));
    }
  }
}

/** Daily rate implied by a monthly salary and the company's working-days figure. */
export function monthlyToDailyRate(monthlyBase: Rupiah, workingDaysPerMonth: number): Rupiah {
  if (workingDaysPerMonth <= 0) return 0;
  return toRupiah(monthlyBase / workingDaysPerMonth);
}

// ───────────────────────────────────────────────────────────────────────────
// Overtime pay (statutory multipliers — docs/05 §4). The multipliers are part of
// the *method* (Kepmenaker / UU Cipta Kerja), like the 1/173 base above; only
// the wage is variable input.
// ───────────────────────────────────────────────────────────────────────────

const OT_WEEKDAY_HOUR1_BPS = 15_000; // ×1.5 (first weekday hour)
const OT_WEEKDAY_REST_BPS = 20_000; // ×2.0 (weekday hours 2–8)
const OT_RESTDAY_1_8_BPS = 20_000; // ×2.0 (rest-day/holiday hours 1–8)
const OT_RESTDAY_9_BPS = 30_000; // ×3.0 (rest-day/holiday hour 9)
const OT_RESTDAY_10_11_BPS = 40_000; // ×4.0 (rest-day/holiday hours 10–11)

/** Weekday overtime pay: 1st hour ×1.5, subsequent hours ×2.0. */
export function overtimePayWeekday(hours: number, monthlyWage: Rupiah): Rupiah {
  if (hours <= 0) return 0;
  const hourly = overtimeHourlyBase(monthlyWage);
  const first = percentBps(hourly, OT_WEEKDAY_HOUR1_BPS);
  const rest = percentBps(hourly, OT_WEEKDAY_REST_BPS) * Math.max(0, Math.ceil(hours) - 1);
  return sum(first, rest);
}

/**
 * Rest-day / public-holiday overtime pay (5-day workweek): hours 1–8 ×2.0,
 * hour 9 ×3.0, hours 10–11 ×4.0.
 */
export function overtimePayRestDay(hours: number, monthlyWage: Rupiah): Rupiah {
  const h = Math.max(0, Math.ceil(hours));
  if (h <= 0) return 0;
  const hourly = overtimeHourlyBase(monthlyWage);
  const band1 = Math.min(h, 8);
  const band2 = Math.min(Math.max(h - 8, 0), 1); // 9th hour
  const band3 = Math.min(Math.max(h - 9, 0), 2); // 10th–11th hours
  return sum(
    percentBps(hourly, OT_RESTDAY_1_8_BPS) * band1,
    percentBps(hourly, OT_RESTDAY_9_BPS) * band2,
    percentBps(hourly, OT_RESTDAY_10_11_BPS) * band3,
  );
}

/** Total overtime pay for a period given weekday and rest-day/holiday hours. */
export function computeOvertimePay(args: {
  monthlyWage: Rupiah;
  weekdayHours?: number;
  restDayHours?: number;
}): Rupiah {
  return sum(
    overtimePayWeekday(args.weekdayHours ?? 0, args.monthlyWage),
    overtimePayRestDay(args.restDayHours ?? 0, args.monthlyWage),
  );
}

/** One approved overtime row, reduced to what pay computation needs. */
export interface OvertimeEntry {
  /** YYYY-MM-DD. */
  date: string;
  durationMinutes: number;
}

/**
 * Whether a YYYY-MM-DD date is a rest day / public holiday for overtime
 * classification: Sunday always rests; Saturday rests on a 5-day workweek; any
 * seeded holiday rests. UTC day avoids a timezone offset shifting the weekday.
 */
export function isRestDayOrHoliday(
  dateStr: string,
  holidayDates: Set<string>,
  workweekDays: number,
): boolean {
  const day = new Date(dateStr).getUTCDay();
  if (day === 0) return true;
  if (day === 6 && workweekDays === 5) return true;
  return holidayDates.has(dateStr);
}

/**
 * Total approved-overtime rupiah for a period from raw entries. Single source of
 * truth shared by the run preview (apps/web) and the payroll worker (services)
 * so the draft and the processed run agree to the rupiah. Classifies each entry
 * by date, sums hours per bucket, then applies the statutory bands above.
 */
export function computeOvertimePayFromEntries(args: {
  entries: OvertimeEntry[];
  monthlyWage: Rupiah;
  holidayDates: Set<string>;
  workweekDays: number;
}): Rupiah {
  let weekdayHours = 0;
  let restDayHours = 0;
  for (const e of args.entries) {
    const hours = e.durationMinutes / 60;
    if (isRestDayOrHoliday(e.date, args.holidayDates, args.workweekDays)) {
      restDayHours += hours;
    } else {
      weekdayHours += hours;
    }
  }
  return computeOvertimePay({ monthlyWage: args.monthlyWage, weekdayHours, restDayHours });
}

// ───────────────────────────────────────────────────────────────────────────
// PPh 21 TER category + data-driven rate lookup (docs/05 §1).
// The rate *numbers* are seed data in the reference tables (Antigravity); this
// only encodes the PTKP→category mapping (method) and the lookup mechanism.
// ───────────────────────────────────────────────────────────────────────────

export type TerCategory = "A" | "B" | "C";

/** PTKP status → TER category per PMK 168/2023. */
export function ptkpCategory(status: PtkpStatus): TerCategory {
  switch (status) {
    case "TK/0":
    case "TK/1":
    case "K/0":
      return "A";
    case "TK/2":
    case "TK/3":
    case "K/1":
    case "K/2":
      return "B";
    case "K/3":
      return "C";
  }
}

/** A single TER band row (loaded from the `ter_rates` reference table). */
export interface TerRateRow {
  category: TerCategory;
  /** Inclusive lower bound of the monthly-gross band, whole rupiah. */
  minGross: Rupiah;
  /** Effective rate in basis points (e.g. 25 = 0.25%). */
  rateBps: number;
}

/**
 * Build a `terRateBps(status, gross)` lookup from reference-table rows. For each
 * category the applicable band is the one with the greatest `minGross ≤ gross`.
 * Throws if a category has no band covering the gross (misconfigured seed data).
 */
export function buildTerLookup(
  rows: TerRateRow[],
): (status: PtkpStatus, grossMonthly: Rupiah) => number {
  const byCategory: Record<TerCategory, TerRateRow[]> = { A: [], B: [], C: [] };
  for (const row of rows) byCategory[row.category].push(row);
  for (const cat of ["A", "B", "C"] as const) {
    byCategory[cat].sort((a, b) => a.minGross - b.minGross);
  }

  return (status, grossMonthly) => {
    const bands = byCategory[ptkpCategory(status)];
    let match: TerRateRow | undefined;
    for (const band of bands) {
      if (band.minGross <= grossMonthly) match = band;
      else break;
    }
    if (!match) {
      throw new Error(
        `No TER band for category ${ptkpCategory(status)} at gross ${grossMonthly}`,
      );
    }
    return match.rateBps;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// December reconciliation — annual progressive method (docs/05 §1).
// ───────────────────────────────────────────────────────────────────────────

/** A progressive bracket. `upTo = null` is the open-ended top bracket. */
export interface ProgressiveBracket {
  upTo: Rupiah | null;
  rateBps: number;
}

export interface AnnualTaxConfig {
  ptkpAnnualByStatus: Record<PtkpStatus, Rupiah>;
  brackets: ProgressiveBracket[];
  biayaJabatanRateBps: number; // 500 = 5%
  biayaJabatanAnnualCap: Rupiah; // e.g. 6,000,000
}

export interface DecemberInput {
  annualGross: Rupiah;
  ptkpStatus: PtkpStatus;
  hasNpwp: boolean;
  /** Employee-side pension/JHT contributions paid across the year. */
  annualPensionJhtEmployee: Rupiah;
  /** PPh 21 already withheld via TER, Jan–Nov. */
  ytdPph21Withheld: Rupiah;
}

export interface DecemberResult {
  biayaJabatan: Rupiah;
  annualNet: Rupiah;
  pkp: Rupiah;
  annualTax: Rupiah;
  /** annualTax − ytdPph21Withheld. Negative means an over-withholding (refund). */
  decemberWithholding: Rupiah;
}

/** Floor to the nearest whole thousand rupiah (PKP rounding rule). */
function floorToThousand(amount: Rupiah): Rupiah {
  return Math.floor(amount / 1000) * 1000;
}

/** Tax on a taxable amount using progressive brackets (ascending, top = upTo:null). */
export function progressiveTax(pkp: Rupiah, brackets: ProgressiveBracket[]): Rupiah {
  if (pkp <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const upper = bracket.upTo ?? Infinity;
    if (pkp <= lower) break;
    const sliceTop = Math.min(pkp, upper);
    const slice = sliceTop - lower;
    if (slice > 0) tax += percentBps(slice, bracket.rateBps);
    lower = upper;
  }
  return toRupiah(tax);
}

/**
 * December annual reconciliation: recompute full-year PPh 21 on a progressive
 * basis and net off what TER already withheld Jan–Nov.
 */
export function computeDecemberReconciliation(
  input: DecemberInput,
  cfg: AnnualTaxConfig,
): DecemberResult {
  const biayaJabatan = capAt(
    percentBps(input.annualGross, cfg.biayaJabatanRateBps),
    cfg.biayaJabatanAnnualCap,
  );
  const annualNet = subtract(
    input.annualGross,
    sum(biayaJabatan, input.annualPensionJhtEmployee),
  );
  const ptkp = cfg.ptkpAnnualByStatus[input.ptkpStatus];
  const pkp = floorToThousand(Math.max(0, subtract(annualNet, ptkp)));

  let annualTax = progressiveTax(pkp, cfg.brackets);
  if (!input.hasNpwp) annualTax = percentBps(annualTax, NO_NPWP_SURCHARGE_BPS);

  return {
    biayaJabatan,
    annualNet,
    pkp,
    annualTax,
    decemberWithholding: subtract(annualTax, input.ytdPph21Withheld),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THR — religious-holiday bonus (docs/05 §5).
// ───────────────────────────────────────────────────────────────────────────

/**
 * THR entitlement: a full month's salary at ≥12 months of service, otherwise
 * prorated by months worked. Sub-1-month tenure yields 0 (not yet entitled).
 */
export function computeThr(monthlySalary: Rupiah, monthsWorked: number): Rupiah {
  if (monthsWorked < 1) return 0;
  if (monthsWorked >= 12) return monthlySalary;
  return toRupiah((monthlySalary * monthsWorked) / 12);
}

// ───────────────────────────────────────────────────────────────────────────
// Reference-table → config loaders (pure mappers; see config.ts).
// ───────────────────────────────────────────────────────────────────────────
export {
  buildPayrollConfig,
  buildAnnualTaxConfig,
  toTerRateRows,
  toProgressiveBrackets,
  BIAYA_JABATAN_RATE_BPS,
  BIAYA_JABATAN_ANNUAL_CAP,
  type BpjsConfigRow,
  type TerRateDbRow,
  type PtkpRateRow,
  type TaxBracketRow,
} from "./config";

// ───────────────────────────────────────────────────────────────────────────
// Shared statutory-reference helpers (NEXT-1: one statutory source).
// ───────────────────────────────────────────────────────────────────────────
export {
  PTKP_STATUSES,
  JKK_RISK_CLASSES,
  periodStart,
  periodEnd,
  effectiveOn,
  sumFixedAllowances,
} from "./statutory";

// ───────────────────────────────────────────────────────────────────────────
// Weekly work schedule + mid-month-hire proration (ADR 0006).
// ───────────────────────────────────────────────────────────────────────────
export {
  WEEKDAYS,
  DEFAULT_WORK_DAYS,
  normalizeWorkDays,
  isoWeekday,
  isExpectedWorkday,
  expectedWorkdaysInMonth,
  expectedWorkdaysFrom,
  hireProrationFactor,
  prorateByFactor,
  type WeekdayMeta,
  type HireProrationFactor,
} from "./work-schedule";
