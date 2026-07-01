import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { formatRupiah, type Rupiah } from "@nexis/money";
import {
  buildPayrollConfig,
  computeEarnedBase,
  computeMonthlyPayroll,
  computeOvertimePayFromEntries,
  computeThr,
  ptkpCategory,
  type EmployeePayrollInput,
  type JkkRiskClass,
  type PayFrequency,
  type PayrollConfig,
  type PayrollResult,
  type PtkpStatus,
  type TerCategory,
} from "@nexis/payroll";
import {
  computeEarningLines,
  loadBulkEarnings,
  resolveFromBulk,
  sumTaxableEarnings,
  type EarningLine,
} from "./earnings";
import { normalizeWorkDays, expectedWorkdaysInMonth } from "./work-schedule";
import { loadBulkManualDeductions, sumManualDeductionsForPeriod } from "./manual-deductions";

export type RunType = "monthly" | "thr";

/**
 * Thrown when the global rate reference (bpjs_config / ter_rates) can't be
 * loaded for a run period — e.g. a transient PostgREST failure (schema-cache
 * reload right after a migration) or a genuinely missing seed. Without this the
 * failure surfaced deep inside the pure engine ("bpjs_config missing key …" /
 * "No TER band …") as an opaque 500. Callers catch it and show a clear,
 * retryable message instead of crashing the page/action.
 */
export class PayrollConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollConfigError";
  }
}

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
  const [{ data: bpjs, error: bpjsErr }, { data: ter, error: terErr }] = await Promise.all([
    supabase.from("bpjs_config").select("key, rate_bps, amount, effective_from, effective_to"),
    supabase.from("ter_rates").select("category, income_lower, rate_bps, effective_from, effective_to"),
  ]);

  // Surface a load failure (or an empty reference set) as a clear, typed error
  // instead of letting buildPayrollConfig throw a cryptic "missing key" / "No TER
  // band" deep in the engine. Both are global seed tables, so an empty result on
  // a non-erroring query means the data isn't there yet (or PostgREST is mid
  // schema-cache reload) — a retryable condition, not a programming bug.
  if (bpjsErr) throw new PayrollConfigError(`Gagal memuat konfigurasi BPJS: ${bpjsErr.message}`);
  if (terErr) throw new PayrollConfigError(`Gagal memuat tarif PPh 21 (TER): ${terErr.message}`);

  const bpjsRows = effectiveOn(bpjs ?? [], effectiveDate);
  const terRows = effectiveOn(ter ?? [], effectiveDate);
  if (bpjsRows.length === 0 || terRows.length === 0) {
    throw new PayrollConfigError(
      "Konfigurasi tarif (BPJS / PPh 21) belum tersedia untuk periode ini. Coba lagi sebentar.",
    );
  }

  try {
    return buildPayrollConfig(bpjsRows, terRows);
  } catch (err) {
    throw new PayrollConfigError(
      `Gagal menyusun konfigurasi payroll: ${err instanceof Error ? err.message : "kesalahan tak terduga"}`,
    );
  }
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
  pay_frequency: string;
  daily_rate: number | null;
  /** Per-employee weekly schedule (ISO weekdays) or null to follow the company default. */
  work_days: number[] | null;
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
  /** Unique attendance days in the period for daily-paid employees; null if monthly. */
  daysWorked?: number | null;
  /** Expected workdays this month per the employee's schedule (daily/mixed only). */
  expectedDays?: number | null;
  /** Configurable earnings (allowances) resolved for this employee. */
  earnings?: EarningLine[];
  /** Manual/absence deductions attributed to this period (subtracted from net). */
  manualDeductions?: Rupiah;
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

/** Last day of the run period (YYYY-MM-DD), for period-bounded queries. */
function periodEndDate(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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
  const periodEnd = periodEndDate(year, month);

  const [
    config,
    { data: employees },
    { data: settings },
    { data: comps },
    { data: taxes },
    { data: minWages },
    { data: overtimeEntries },
    { data: holidays },
    { data: attendanceRecords },
    bulkEarnings,
    bulkManualDeductions,
  ] = await Promise.all([
      loadPayrollConfig(supabase, effectiveDate),
      supabase
        .from("employees")
        .select("id, full_name, join_date, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("full_name", { ascending: true }),
      supabase
        .from("company_settings")
        .select("jkk_risk_class, region, workweek_days, work_days")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("compensation")
        .select("employee_id, base_salary, pay_frequency, daily_rate, work_days, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from")
        .eq("company_id", companyId),
      supabase
        .from("tax_profile")
        .select("employee_id, ptkp_status, has_npwp")
        .eq("company_id", companyId),
      supabase
        .from("minimum_wages")
        .select("region, amount, effective_from, effective_to"),
      // Approved overtime for the period — same filter the worker uses, so the
      // preview's overtime pay matches the processed run (shared engine helper).
      supabase
        .from("overtime_entries")
        .select("employee_id, date, duration_minutes")
        .eq("company_id", companyId)
        .eq("is_approved", true)
        .gte("date", effectiveDate)
        .lte("date", periodEnd),
      supabase
        .from("holidays")
        .select("date")
        .gte("date", effectiveDate)
        .lte("date", periodEnd),
      // Attendance for the period — drives days-worked for daily-paid employees,
      // counting unique Asia/Jakarta calendar dates (mirrors the payroll worker).
      supabase
        .from("attendance_records")
        .select("employee_id, event_at")
        .eq("company_id", companyId)
        .gte("event_at", `${effectiveDate}T00:00:00Z`)
        .lte("event_at", `${periodEnd}T23:59:59Z`),
      // Configurable earnings (allowances) for the whole company, resolved per
      // employee in memory below (group assignment wins, else manual rows).
      loadBulkEarnings(supabase, companyId),
      // Manual/absence deductions, grouped by employee; the dated entries in this
      // period are subtracted from net pay below.
      loadBulkManualDeductions(supabase, companyId),
    ]);

  // Unique worked dates per employee (Asia/Jakarta), for daily-pay scaling.
  const jakartaDateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const daysWorkedByEmployee = new Map<string, Set<string>>();
  for (const r of (attendanceRecords as { employee_id: string; event_at: string }[] | null) ?? []) {
    if (!r.employee_id || !r.event_at) continue;
    const set = daysWorkedByEmployee.get(r.employee_id) ?? new Set<string>();
    set.add(jakartaDateFmt.format(new Date(r.event_at)));
    daysWorkedByEmployee.set(r.employee_id, set);
  }

  // Overtime inputs shared with the worker: approved entries grouped by employee,
  // the holiday set, and the company workweek (drives Saturday rest-day rule).
  const workweekDays = settings?.workweek_days ?? 5;
  // Company default weekly schedule (ISO weekdays). A per-employee `work_days`
  // override takes precedence below. The expected workdays in the run month are
  // derived from this schedule and cap daily/mixed paid days.
  const companyWorkDays = normalizeWorkDays(settings?.work_days);
  const holidayDates = new Set(
    ((holidays as { date: string }[] | null) ?? []).map((h) => h.date),
  );
  const otByEmployee = new Map<string, { date: string; durationMinutes: number }[]>();
  for (const row of (overtimeEntries as { employee_id: string; date: string; duration_minutes: number }[] | null) ?? []) {
    const list = otByEmployee.get(row.employee_id) ?? [];
    list.push({ date: row.date, durationMinutes: row.duration_minutes });
    otByEmployee.set(row.employee_id, list);
  }

  // Latest-effective compensation per employee (≤ the run period), with fallback
  // to earliest if none is effective yet. Mirrors the payroll worker.
  const compByEmployee = new Map<string, CompensationRow>();
  const compsByEmpId = new Map<string, CompensationRow[]>();
  for (const row of (comps as CompensationRow[] | null) ?? []) {
    const list = compsByEmpId.get(row.employee_id) ?? [];
    list.push(row);
    compsByEmpId.set(row.employee_id, list);
  }
  for (const [empId, empComps] of compsByEmpId.entries()) {
    let bestComp: CompensationRow | null = null;
    for (const row of empComps) {
      if (row.effective_from <= periodEnd) {
        if (!bestComp || row.effective_from > bestComp.effective_from) {
          bestComp = row;
        }
      }
    }
    if (!bestComp && empComps.length > 0) {
      for (const row of empComps) {
        if (!bestComp || row.effective_from < bestComp.effective_from) {
          bestComp = row;
        }
      }
    }
    if (bestComp) {
      compByEmployee.set(empId, bestComp);
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
      // Same isolation as the monthly branch below: a bad row must degrade to a
      // per-employee warning, not throw and 500 the whole preview.
      try {
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
      } catch (err) {
        warnings.push(
          `Gagal menghitung THR karyawan ini: ${err instanceof Error ? err.message : "kesalahan tak terduga"}. Periksa data kompensasi/pajaknya.`,
        );
        lines.push({
          employeeId: emp.id,
          name: emp.full_name,
          ptkpStatus,
          terCategory: ptkpCategory(ptkpStatus),
          hasNpwp,
          baseSalary: 0,
          warnings,
        });
      }
      continue;
    }

    // Earned base by pay frequency (working-days model):
    //  - monthly → full monthly base.
    //  - daily   → daily rate × unique attendance days.
    //  - mixed   → monthly base + daily rate × unique attendance days.
    // The daily rate is `daily_rate` when set, else `base_salary` (legacy daily).
    let frequency: PayFrequency;
    let usesDays: boolean;
    let expectedDays: number;
    let attendedDays: number;
    let daysWorked: number | null;
    let earnedBase: Rupiah;
    let earnings: EarningLine[];
    let result: PayrollResult;

    try {
      frequency = (["monthly", "daily", "mixed"].includes(comp.pay_frequency)
        ? comp.pay_frequency
        : "monthly") as PayFrequency;
      usesDays = frequency === "daily" || frequency === "mixed";
      // The employee's expected weekly schedule (own override, else company default)
      // → expected workdays this month. Pay days are the attended days capped at the
      // expected days, so a daily/mixed employee is never paid beyond their roster.
      const schedule =
        comp.work_days && comp.work_days.length > 0
          ? normalizeWorkDays(comp.work_days)
          : companyWorkDays;
      expectedDays = usesDays ? expectedWorkdaysInMonth(schedule, year, month) : 0;
      attendedDays = usesDays ? daysWorkedByEmployee.get(emp.id)?.size ?? 0 : 0;
      daysWorked = usesDays ? Math.min(attendedDays, expectedDays) : null;
      const dailyRate = comp.daily_rate ?? baseSalary;
      const monthlyBase = frequency === "daily" ? 0 : baseSalary;
      earnedBase = computeEarnedBase({
        payFrequency: frequency,
        monthlyBase,
        dailyRate,
        daysWorked: daysWorked ?? 0,
      });
      if (usesDays && daysWorked === 0) {
        warnings.push("Belum ada kehadiran tercatat periode ini — porsi harian dihitung 0.");
      }

      // Configurable earnings (allowances): resolved set → rupiah lines. Taxable
      // lines flow into gross via fixedAllowances; the worker adds any non-taxable
      // lines post-tax (TODO handoff). Percentage earnings use the earned base.
      earnings = computeEarningLines(resolveFromBulk(bulkEarnings, emp.id), {
        gross: earnedBase + sumFixedAllowances(comp.fixed_allowances),
        baseSalary: earnedBase,
      });
      const fixedAllowances = sumFixedAllowances(comp.fixed_allowances) + sumTaxableEarnings(earnings);

      const input: EmployeePayrollInput = {
        baseSalary: earnedBase,
        fixedAllowances,
        overtimePay: computeOvertimePayFromEntries({
          entries: otByEmployee.get(emp.id) ?? [],
          monthlyWage: baseSalary,
          holidayDates,
          workweekDays,
        }),
        ptkpStatus,
        hasNpwp,
        jkkRiskClass: companyRisk,
        bpjsKesEnrolled: comp.bpjs_kes_enrolled,
        jhtEnrolled: comp.jht_enrolled,
        jpEnrolled: comp.jp_enrolled,
      };
      // Isolate one employee's compute: a single pathological row (e.g. a value
      // that rounds to NaN, or a TER gap) becomes a per-employee warning instead
      // of throwing and 500-ing the whole run preview and the page that renders it.
      result = computeMonthlyPayroll(input, config);
    } catch (err) {
      // Failure in Stage 7 helpers (work schedule normalization, earning resolution,
      // overtime/earning computation, etc.) or computeMonthlyPayroll becomes a
      // per-employee warning instead of crashing the preview.
      warnings.push(
        `Gagal menghitung gaji karyawan ini: ${err instanceof Error ? err.message : "kesalahan tak terduga"}. Periksa data kompensasi/pajaknya.`,
      );
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

    // Manual/absence deductions dated in this period reduce net pay.
    const manualDeductions = sumManualDeductionsForPeriod(
      bulkManualDeductions.get(emp.id),
      effectiveDate,
      periodEnd,
    );
    if (manualDeductions > 0 && attendedDays < expectedDays) {
      warnings.push(
        `Ada potongan absensi (${formatRupiah(manualDeductions)}) untuk periode ini.`,
      );
    }

    // UMR compares a monthly wage; only meaningful for fully monthly pay.
    if (frequency === "monthly" && umrAmount != null && baseSalary < umrAmount) {
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
      baseSalary: earnedBase,
      daysWorked,
      expectedDays: usesDays ? expectedDays : null,
      earnings,
      manualDeductions,
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
        acc.net += line.result.netPay - (line.manualDeductions ?? 0);
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

// ───────────────────────────────────────────────────────────────────────────
// Pre-run readiness gate (Case-02 G7). A draft must not silently fall back to
// TK/0 / zero-pay for employees with incomplete master data — block instead and
// list exactly who needs what. Computed entirely from existing tables (no DB
// object): each active employee needs compensation in force, a tax profile, and
// a bank account with an account number.
// ───────────────────────────────────────────────────────────────────────────

/** Stable blocking issue codes; the UI maps these to localized labels. */
export type ReadinessIssue = "compensation" | "tax" | "bank";

/** Per-employee master-data readiness. `issues` block payroll; `npwpMissing` only warns. */
export interface EmployeeReadiness {
  employeeId: string;
  name: string;
  issues: ReadinessIssue[];
  npwpMissing: boolean;
}

/** 🟢 ready · 🟡 attention (no NPWP, +20% PPh 21) · 🔴 incomplete (blocking gap). */
export type ReadinessStatus = "ready" | "attention" | "incomplete";

export function readinessStatus(r: EmployeeReadiness): ReadinessStatus {
  if (r.issues.length > 0) return "incomplete";
  if (r.npwpMissing) return "attention";
  return "ready";
}

export interface EmployeeBlocker {
  employeeId: string;
  name: string;
  issues: ReadinessIssue[];
}

export interface EmployeeWarning {
  employeeId: string;
  name: string;
}

export interface RunReadiness {
  ready: boolean;
  blockers: EmployeeBlocker[];
  warnings: EmployeeWarning[];
}

/**
 * Per-employee readiness for every active employee. Each needs compensation, a
 * tax profile, and a bank account with a number; a tax profile without an NPWP
 * is a non-blocking warning (+20% PPh 21).
 */
async function loadEmployeeReadiness(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<EmployeeReadiness[]> {
  const [{ data: employees }, { data: comps }, { data: taxes }, { data: banks }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase.from("compensation").select("employee_id, effective_from").eq("company_id", companyId),
    supabase.from("tax_profile").select("employee_id, has_npwp").eq("company_id", companyId),
    supabase.from("bank_accounts").select("employee_id, account_no").eq("company_id", companyId),
  ]);

  // Any compensation row makes an employee ready: the run engine selects the
  // latest row ≤ the period, falling back to the earliest if none is effective
  // yet, so a row that exists will always produce a salary in the run.
  const hasComp = new Set(
    ((comps as { employee_id: string; effective_from: string }[] | null) ?? [])
      .map((c) => c.employee_id),
  );
  const taxRows = (taxes as { employee_id: string; has_npwp: boolean | null }[] | null) ?? [];
  const hasTax = new Set(taxRows.map((t) => t.employee_id));
  const npwpByEmp = new Map(taxRows.map((t) => [t.employee_id, t.has_npwp === true]));
  const hasBank = new Set(
    ((banks as { employee_id: string; account_no: string | null }[] | null) ?? [])
      .filter((b) => (b.account_no ?? "").trim() !== "")
      .map((b) => b.employee_id),
  );

  return ((employees as { id: string; full_name: string }[] | null) ?? []).map((emp) => {
    const issues: ReadinessIssue[] = [];
    if (!hasComp.has(emp.id)) issues.push("compensation");
    if (!hasTax.has(emp.id)) issues.push("tax");
    // NPWP warning is only meaningful when a tax profile exists (no profile is already a blocker).
    const npwpMissing = hasTax.has(emp.id) && !npwpByEmp.get(emp.id);
    return { employeeId: emp.id, name: emp.full_name, issues, npwpMissing };
  });
}

/** Pre-run gate (Case-02 G7) for a specific period. */
export async function computeRunReadiness(
  supabase: SupabaseClient<Database>,
  companyId: string,
  args: { year: number; month: number },
): Promise<RunReadiness> {
  const rows = await loadEmployeeReadiness(supabase, companyId);
  const blockers = rows
    .filter((r) => r.issues.length > 0)
    .map(({ employeeId, name, issues }) => ({ employeeId, name, issues }));
  const warnings = rows
    .filter((r) => r.npwpMissing)
    .map(({ employeeId, name }) => ({ employeeId, name }));
  return { ready: blockers.length === 0, blockers, warnings };
}

/** Readiness for the employee-list badge (P1-2). */
export async function computeEmployeeReadiness(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<EmployeeReadiness[]> {
  return loadEmployeeReadiness(supabase, companyId);
}

// Re-export client-safe formatters so server components can keep importing them
// from "@/lib/payroll".
export { MONTH_NAMES_ID, formatPeriod, formatRupiah } from "./payroll-format";
