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
import { type Rupiah, sum, subtract, percentBps, capAt } from "@nexis/money";

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
