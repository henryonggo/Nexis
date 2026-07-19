import type { Rupiah } from "@nexis/money";
import {
  computeMonthlyPayroll,
  ptkpCategory,
  PTKP_STATUSES,
  JKK_RISK_CLASSES,
  periodStart,
  periodEnd,
  effectiveOn,
  sumFixedAllowances,
  type JkkRiskClass,
  type PayrollConfig,
  type PayrollResult,
  type PtkpStatus,
  type TerCategory,
} from "@nexis/payroll";
import type { HaltReason } from "../result";

/**
 * Shared per-employee statutory computation over PRELOADED rows — the pure
 * core of compute_pph21_for_employee (one employee) and compute_payroll_run
 * (whole roster). Loading is the tools' job; this module never touches the
 * client, so both tools provably apply identical rules.
 *
 * Never estimates (pivot ground rule 1): any missing/ambiguous input returns
 * halt reasons instead of a number.
 *
 * PTKP_STATUSES / JKK_RISK_CLASSES / periodStart / periodEnd / effectiveOn /
 * sumFixedAllowances live in @nexis/payroll (NEXT-1: one statutory source,
 * shared with apps/web/lib/payroll.ts) — re-exported here so existing
 * imports from "./statutory" keep working.
 */
export { PTKP_STATUSES, JKK_RISK_CLASSES, periodStart, periodEnd, effectiveOn, sumFixedAllowances };

// Row shapes matching the columns the tools select (subset of generated Rows).
export interface CompRow {
  employee_id: string;
  base_salary: number;
  pay_frequency: string;
  fixed_allowances: unknown;
  bpjs_kes_enrolled: boolean;
  jht_enrolled: boolean;
  jp_enrolled: boolean;
  effective_from: string;
}

export interface TaxRow {
  ptkp_status: string;
  has_npwp: boolean;
}

export interface EarningTypeRow {
  id: string;
  name: string;
  calc: string;
  amount: number | null;
  rate_bps: number | null;
  base: string | null;
  taxable: boolean;
  active: boolean;
}

export interface ManualEarningRow {
  custom_type_id: string | null;
  amount_override: number | null;
  enabled: boolean;
}

/** One resolved configurable earning, echoed for the approval queue. */
export interface EarningLineOut {
  label: string;
  amount: Rupiah;
  taxable: boolean;
}

export interface StatutoryLine {
  employeeId: string;
  fullName: string;
  inputs: {
    baseSalary: Rupiah;
    /** compensation.fixed_allowances + taxable configurable earnings. */
    fixedAllowances: Rupiah;
    gross: Rupiah;
    ptkpStatus: PtkpStatus;
    terCategory: TerCategory;
    hasNpwp: boolean;
    jkkRiskClass: JkkRiskClass;
  };
  /** Resolved configurable earnings (all fixed-amount in v0). */
  earnings: EarningLineOut[];
  /**
   * Total of non-taxable earning lines. NOT part of gross and NOT included in
   * result.netPay (statutory net); the payslip take-home adds it post-tax.
   */
  nonTaxableEarnings: Rupiah;
  /** Full statutory breakdown from @nexis/payroll — all integer rupiah. */
  result: PayrollResult;
}

export interface StatutoryInput {
  employee: { id: string; full_name: string };
  /** ALL compensation rows for this employee (latest in-force row is picked here). */
  comps: CompRow[];
  tax: TaxRow | null;
  /** company_settings.jkk_risk_class, unvalidated. */
  jkkRiskClassRaw: string | null | undefined;
  earningTypesById: Map<string, EarningTypeRow>;
  /** This employee's employee_earning rows. */
  manualEarnings: ManualEarningRow[];
  hasGroupAssignment: boolean;
  hasApprovedOvertime: boolean;
  config: PayrollConfig;
  /** YYYY-MM-DD start of the run period. */
  periodStart: string;
  /** YYYY-MM-DD end of the run period. */
  periodEnd: string;
}

export type StatutoryOutcome = { line: StatutoryLine } | { halts: HaltReason[] };

export function computeEmployeeStatutory(input: StatutoryInput): StatutoryOutcome {
  const { employee } = input;
  const halts: HaltReason[] = [];

  // Latest compensation effective on/before the period end. Unlike the run
  // preview, there is NO fallback to a future-effective row — that would be
  // paying from a contract that isn't in force yet.
  let comp: CompRow | null = null;
  for (const row of input.comps) {
    if (row.effective_from <= input.periodEnd && (!comp || row.effective_from > comp.effective_from)) {
      comp = row;
    }
  }
  if (!comp) {
    halts.push({
      code: "missing_compensation",
      message: `${employee.full_name} has no compensation row in force on ${input.periodEnd}.`,
      needs: "compensation row (base_salary, pay_frequency) effective on/before the period end",
    });
  } else if (comp.pay_frequency !== "monthly") {
    halts.push({
      code: "unsupported_pay_frequency",
      message: `${employee.full_name} is paid "${comp.pay_frequency}"; v0 computes monthly-paid employees only (daily/mixed needs attendance-derived earned base).`,
    });
  } else if (comp.effective_from > input.periodStart) {
    // Mid-period hire/comp change (dry-run pre-flight 2026-07-19, staging
    // employee E-7 effective 2026-07-17): the selected row is not in force
    // for the whole period, so a full month's pay is an estimate — forbidden
    // (pivot ground rule 1). Halt instead of silently paying the whole month.
    halts.push({
      code: "mid_period_compensation",
      message: `${employee.full_name}'s compensation is effective ${comp.effective_from}, after the period start ${input.periodStart} — a full month would be estimated.`,
      needs: "compensation effective on/before the period start, or proration support (not built — v0 computes whole months only)",
    });
  }

  if (!input.tax) {
    halts.push({
      code: "missing_tax_profile",
      message: `${employee.full_name} has no tax profile (PTKP status, NPWP).`,
      needs: "tax_profile row (ptkp_status, has_npwp)",
    });
  } else if (!PTKP_STATUSES.has(input.tax.ptkp_status as PtkpStatus)) {
    halts.push({
      code: "invalid_ptkp_status",
      message: `Unknown PTKP status "${input.tax.ptkp_status}" for ${employee.full_name}.`,
      needs: "one of TK/0..TK/3, K/0..K/3",
    });
  }

  const rawRisk = input.jkkRiskClassRaw;
  if (!rawRisk || !JKK_RISK_CLASSES.has(rawRisk as JkkRiskClass)) {
    halts.push({
      code: "missing_jkk_risk_class",
      message: `Company JKK risk class is ${rawRisk ? `unknown ("${rawRisk}")` : "not set"} in company_settings.`,
      needs: "company_settings.jkk_risk_class ∈ very_low..very_high",
    });
  }

  if (input.hasApprovedOvertime) {
    halts.push({
      code: "overtime_not_supported",
      message: `${employee.full_name} has approved overtime in the period; v0 gross excludes overtime, which would understate PPh 21.`,
    });
  }

  // Configurable earnings — same resolution rule as apps/web/lib/earnings.ts
  // (group assignment wins, else manual enabled rows; inactive types drop
  // out). v0 computes fixed-amount earnings exactly and halts on anything it
  // can't: a group assignment (shared template semantics not ported yet) or
  // a percentage earning (its base definition follows earned-base logic that
  // lands with the full-cycle tool set).
  const earnings: EarningLineOut[] = [];
  if (input.hasGroupAssignment) {
    halts.push({
      code: "earning_groups_not_supported",
      message: `${employee.full_name} is assigned to an earning group; v0 resolves manual earnings only.`,
    });
  } else {
    for (const row of input.manualEarnings) {
      if (!row.enabled || !row.custom_type_id) continue;
      const type = input.earningTypesById.get(row.custom_type_id);
      if (!type || !type.active) continue;
      if (type.calc !== "fixed") {
        halts.push({
          code: "percent_earnings_not_supported",
          message: `Earning "${type.name}" for ${employee.full_name} is percentage-based; v0 computes fixed-amount earnings only.`,
        });
        continue;
      }
      earnings.push({
        label: type.name,
        amount: Math.round(row.amount_override ?? type.amount ?? 0),
        taxable: type.taxable,
      });
    }
  }

  if (halts.length > 0 || !comp || !input.tax) return { halts };

  const ptkpStatus = input.tax.ptkp_status as PtkpStatus;
  const jkkRiskClass = rawRisk as JkkRiskClass;
  const baseSalary = Math.round(comp.base_salary);
  // Taxable earning lines flow into gross via fixedAllowances — the same
  // path computeRunPreview uses — so PPh 21 sees the full taxable gross.
  const taxableEarnings = earnings.reduce((acc, l) => acc + (l.taxable ? l.amount : 0), 0);
  const nonTaxableEarnings = earnings.reduce((acc, l) => acc + (l.taxable ? 0 : l.amount), 0);
  const fixedAllowances = sumFixedAllowances(comp.fixed_allowances) + taxableEarnings;

  const result = computeMonthlyPayroll(
    {
      baseSalary,
      fixedAllowances,
      overtimePay: 0,
      ptkpStatus,
      hasNpwp: input.tax.has_npwp,
      jkkRiskClass,
      bpjsKesEnrolled: comp.bpjs_kes_enrolled,
      jhtEnrolled: comp.jht_enrolled,
      jpEnrolled: comp.jp_enrolled,
    },
    input.config,
  );

  return {
    line: {
      employeeId: employee.id,
      fullName: employee.full_name,
      inputs: {
        baseSalary,
        fixedAllowances,
        gross: result.gross,
        ptkpStatus,
        terCategory: ptkpCategory(ptkpStatus),
        hasNpwp: input.tax.has_npwp,
        jkkRiskClass,
      },
      earnings,
      nonTaxableEarnings,
      result,
    },
  };
}
