import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { formatRupiah, type Rupiah } from "@nexis/money";
import {
  buildPayrollConfig,
  computeMonthlyPayroll,
  computeThr,
  ptkpCategory,
  type EmployeePayrollInput,
  type JkkRiskClass,
  type PayrollConfig,
  type PayrollResult,
  type PtkpStatus,
  type TerCategory,
} from "@nexis/payroll";

export type RunType = "monthly" | "thr";

const PTKP_STATUSES = new Set<PtkpStatus>([
  "TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3",
]);
const JKK_RISK_CLASSES = new Set<JkkRiskClass>([
  "very_low", "low", "medium", "high", "very_high",
]);

/** SQL predicate for "this reference row is in force on `date`" (YYYY-MM-DD). */
function effectiveOn<T extends { effective_from: string; effective_to: string | null }>(
  rows: T[],
  date: string,
): T[] {
  return rows.filter(
    (r) => r.effective_from <= date && (r.effective_to == null || r.effective_to >= date),
  );
}

/**
 * Load the BPJS + TER reference rows in force on `effectiveDate` and assemble a
 * `PayrollConfig`. Reference tables are global (not company-scoped), so this is
 * the same config the Cloud Run worker will snapshot per run — keeping the
 * mapping here (and pure in @nexis/payroll) is what makes a completed run
 * reproducible (Stage 4 AC #5).
 */
export async function loadPayrollConfig(
  supabase: SupabaseClient<Database>,
  effectiveDate: string,
): Promise<PayrollConfig> {
  const [{ data: bpjs }, { data: ter }] = await Promise.all([
    supabase.from("bpjs_config").select("key, rate_bps, amount, effective_from, effective_to"),
    supabase.from("ter_rates").select("category, income_lower, rate_bps, effective_from, effective_to"),
  ]);

  return buildPayrollConfig(
    effectiveOn(bpjs ?? [], effectiveDate),
    effectiveOn(ter ?? [], effectiveDate),
  );
}

/** A `fixed_allowances` JSON blob can be a number, an array of {amount}, or a map. */
export function sumFixedAllowances(value: unknown): Rupiah {
  if (typeof value === "number") return Math.round(value);
  if (Array.isArray(value)) {
    return value.reduce<number>((acc, item) => {
      const amount = typeof item === "number" ? item : Number((item as { amount?: unknown })?.amount ?? 0);
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

interface CompensationRow {
  employee_id: string;
  base_salary: number;
  fixed_allowances: Database["public"]["Tables"]["compensation"]["Row"]["fixed_allowances"];
  bpjs_kes_enrolled: boolean;
  jht_enrolled: boolean;
  jp_enrolled: boolean;
  effective_from: string;
}

interface MinimumWageRow {
  region: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

/** One employee's computed line in a run preview, with any data-quality warnings. */
export interface PreviewLine {
  employeeId: string;
  name: string;
  ptkpStatus: PtkpStatus;
  terCategory: TerCategory;
  hasNpwp: boolean;
  baseSalary: Rupiah;
  /** Present for monthly runs. */
  result?: PayrollResult;
  /** Present for THR runs. */
  thrAmount?: Rupiah;
  warnings: string[];
}

export interface RunPreview {
  runType: RunType;
  year: number;
  month: number;
  lines: PreviewLine[];
  totals: {
    gross: Rupiah;
    bpjsEmployee: Rupiah;
    bpjsEmployer: Rupiah;
    pph21: Rupiah;
    net: Rupiah;
  };
  /** Run-level blockers/notices (free-plan gating, missing NPWP for filing, etc.). */
  notices: string[];
  /** Snapshot persisted to payroll_runs.config_snapshot for reproducibility. */
  configSnapshot: unknown;
}

/** First day of the run period, used as the reference effective-date (YYYY-MM-DD). */
function periodEffectiveDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Whole months of service between join date and the end of the run period. */
function monthsOfService(joinDate: string | null, year: number, month: number): number {
  if (!joinDate) return 12; // unknown tenure → treat as full entitlement, warn separately
  const join = new Date(joinDate);
  const periodEnd = new Date(Date.UTC(year, month, 0)); // last day of the month
  if (Number.isNaN(join.getTime())) return 12;
  const months =
    (periodEnd.getUTCFullYear() - join.getUTCFullYear()) * 12 +
    (periodEnd.getUTCMonth() - join.getUTCMonth()) +
    1;
  return Math.max(0, months);
}

/**
 * Compute a live preview of a payroll run for the active company. This is the
 * synchronous "dry run" the review screen shows before approval. The persisted
 * compute (writing payroll_items + payslips) is the Cloud Run worker's job once
 * it exists — see `services/payroll-worker` in docs/01-architecture.md. This
 * function and @nexis/payroll are intentionally the reusable core for both.
 */
export async function computeRunPreview(
  supabase: SupabaseClient<Database>,
  companyId: string,
  args: { year: number; month: number; runType: RunType; plan: Database["public"]["Enums"]["plan_tier"] },
): Promise<RunPreview> {
  const { year, month, runType, plan } = args;
  const effectiveDate = periodEffectiveDate(year, month);

  const [config, { data: employees }, { data: settings }, { data: comps }, { data: taxes }, { data: minWages }] =
    await Promise.all([
      loadPayrollConfig(supabase, effectiveDate),
      supabase
        .from("employees")
        .select("id, full_name, join_date, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("full_name", { ascending: true }),
      supabase
        .from("company_settings")
        .select("jkk_risk_class, region")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("compensation")
        .select("employee_id, base_salary, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from")
        .eq("company_id", companyId),
      supabase
        .from("tax_profile")
        .select("employee_id, ptkp_status, has_npwp")
        .eq("company_id", companyId),
      supabase
        .from("minimum_wages")
        .select("region, amount, effective_from, effective_to"),
    ]);

  // Latest-effective compensation per employee (≤ the run period).
  const compByEmployee = new Map<string, CompensationRow>();
  for (const row of (comps as CompensationRow[] | null) ?? []) {
    if (row.effective_from > effectiveDate) continue;
    const current = compByEmployee.get(row.employee_id);
    if (!current || row.effective_from > current.effective_from) {
      compByEmployee.set(row.employee_id, row);
    }
  }

  const taxByEmployee = new Map<string, { ptkp_status: string; has_npwp: boolean }>();
  for (const row of (taxes as { employee_id: string; ptkp_status: string; has_npwp: boolean }[] | null) ?? []) {
    taxByEmployee.set(row.employee_id, row);
  }

  const rawRisk = settings?.jkk_risk_class ?? "low";
  const companyRisk: JkkRiskClass = JKK_RISK_CLASSES.has(rawRisk as JkkRiskClass)
    ? (rawRisk as JkkRiskClass)
    : "low";

  // Regional minimum wage (UMR/UMK) in force on the run period, for the
  // salary-below-minimum warning. Resolved from the company's region.
  const region = settings?.region;
  const umrAmount: Rupiah | null = region
    ? effectiveOn((minWages as MinimumWageRow[] | null) ?? [], effectiveDate)
        .filter((w) => w.region === region)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.amount ?? null
    : null;

  const lines: PreviewLine[] = [];
  for (const emp of (employees as { id: string; full_name: string; join_date: string | null }[] | null) ?? []) {
    const warnings: string[] = [];
    const comp = compByEmployee.get(emp.id);
    const tax = taxByEmployee.get(emp.id);

    const rawPtkp = tax?.ptkp_status ?? "TK/0";
    const ptkpStatus: PtkpStatus = PTKP_STATUSES.has(rawPtkp as PtkpStatus)
      ? (rawPtkp as PtkpStatus)
      : "TK/0";
    if (!tax) warnings.push("Profil pajak belum diisi — memakai TK/0, tanpa NPWP.");
    else if (!PTKP_STATUSES.has(rawPtkp as PtkpStatus)) {
      warnings.push(`Status PTKP "${rawPtkp}" tidak dikenal — memakai TK/0.`);
    }
    const hasNpwp = tax?.has_npwp ?? false;

    if (!comp) {
      warnings.push("Belum ada data kompensasi — dilewati dari perhitungan.");
      lines.push({
        employeeId: emp.id,
        name: emp.full_name,
        ptkpStatus,
        terCategory: ptkpCategory(ptkpStatus),
        hasNpwp,
        baseSalary: 0,
        warnings,
      });
      continue;
    }

    const baseSalary = Math.round(comp.base_salary);

    if (runType === "thr") {
      const months = monthsOfService(emp.join_date, year, month);
      if (!emp.join_date) warnings.push("Tanggal bergabung kosong — THR dihitung penuh.");
      const thrAmount = computeThr(baseSalary, months);
      lines.push({
        employeeId: emp.id,
        name: emp.full_name,
        ptkpStatus,
        terCategory: ptkpCategory(ptkpStatus),
        hasNpwp,
        baseSalary,
        thrAmount,
        warnings,
      });
      continue;
    }

    const input: EmployeePayrollInput = {
      baseSalary,
      fixedAllowances: sumFixedAllowances(comp.fixed_allowances),
      overtimePay: 0, // TODO(stage4): derive from approved attendance overtime hours
      ptkpStatus,
      hasNpwp,
      jkkRiskClass: companyRisk,
      bpjsKesEnrolled: comp.bpjs_kes_enrolled,
      jhtEnrolled: comp.jht_enrolled,
      jpEnrolled: comp.jp_enrolled,
    };
    const result = computeMonthlyPayroll(input, config);

    if (umrAmount != null && baseSalary < umrAmount) {
      warnings.push(
        `Gaji pokok di bawah UMR ${region} (${formatRupiah(umrAmount)}).`,
      );
    }

    lines.push({
      employeeId: emp.id,
      name: emp.full_name,
      ptkpStatus,
      terCategory: ptkpCategory(ptkpStatus),
      hasNpwp,
      baseSalary,
      result,
      warnings,
    });
  }

  const totals = lines.reduce(
    (acc, line) => {
      if (line.result) {
        acc.gross += line.result.gross;
        acc.bpjsEmployee += line.result.bpjsKesEmployee + line.result.jhtEmployee + line.result.jpEmployee;
        acc.bpjsEmployer +=
          line.result.bpjsKesEmployer + line.result.jhtEmployer + line.result.jpEmployer +
          line.result.jkkEmployer + line.result.jkmEmployer;
        acc.pph21 += line.result.pph21;
        acc.net += line.result.netPay;
      } else if (line.thrAmount) {
        acc.gross += line.thrAmount;
        acc.net += line.thrAmount;
      }
      return acc;
    },
    { gross: 0, bpjsEmployee: 0, bpjsEmployer: 0, pph21: 0, net: 0 },
  );

  const notices: string[] = [];
  const payable = lines.filter((l) => l.result || l.thrAmount).length;
  if (plan === "free" && payable > 5) {
    notices.push(
      `Paket gratis terbatas 5 karyawan per run (${payable} terhitung). Upgrade untuk menjalankan payroll penuh.`,
    );
  }
  if (lines.some((l) => !l.hasNpwp)) {
    notices.push(
      "Sebagian karyawan tanpa NPWP dikenakan PPh 21 +20%. Pelaporan pajak resmi memerlukan NPWP perusahaan & paket berbayar.",
    );
  }

  return {
    runType,
    year,
    month,
    lines,
    totals,
    notices,
    configSnapshot: {
      effectiveDate,
      // The worker reads runType from here — payroll_runs has no run_type column,
      // so the run's type is carried in the snapshot it processes.
      runType,
      config: {
        bpjsKesEmployeeBps: config.bpjsKesEmployeeBps,
        bpjsKesEmployerBps: config.bpjsKesEmployerBps,
        jhtEmployeeBps: config.jhtEmployeeBps,
        jhtEmployerBps: config.jhtEmployerBps,
        jpEmployeeBps: config.jpEmployeeBps,
        jpEmployerBps: config.jpEmployerBps,
        jkmEmployerBps: config.jkmEmployerBps,
        jkkEmployerBpsByRisk: config.jkkEmployerBpsByRisk,
        bpjsKesCap: config.bpjsKesCap,
        jpCap: config.jpCap,
      },
    },
  };
}

// Re-export client-safe formatters so server components can keep importing them
// from "@/lib/payroll".
export { MONTH_NAMES_ID, formatPeriod, formatRupiah } from "./payroll-format";
