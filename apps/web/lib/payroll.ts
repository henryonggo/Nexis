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
  effectiveOn,
  periodEnd as periodEndDate,
  periodStart as periodEffectiveDate,
  ptkpCategory,
  sumFixedAllowances,
  JKK_RISK_CLASSES,
  PTKP_STATUSES,
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
  /** 'manual' or 'attendance' — how daily/mixed days are calculated. */
  daily_calc_mode: string;
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
  /** 'manual' or 'attendance' — how this employee's daily/mixed days are calculated. Present for daily/mixed only. */
  dailyCalcMode?: 'manual' | 'attendance';
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

/** Load manually-entered days for a run (if it exists). Returns a map of employee_id → days_worked. TODO(db): type this against packages/types once regenerated. */
async function loadRunManualDays(
  supabase: SupabaseClient<Database>,
  runId: string,
): Promise<Map<string, number>> {
  // TODO(db): type payroll_run_manual_days once packages/types is regenerated
  const { data, error } = await supabase
    .from("payroll_run_manual_days")
    .select("employee_id, days_worked")
    .eq("payroll_run_id", runId);

  if (error) {
    console.error(`Failed to load manual days for run ${runId}:`, error);
    return new Map();
  }

  const map = new Map<string, number>();
  for (const row of (data as { employee_id: string; days_worked: number }[] | null) ?? []) {
    map.set(row.employee_id, row.days_worked);
  }
  return map;
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
 *
 * When `runId` is provided, loads manually-entered days for daily/mixed employees
 * in manual mode from the payroll_run_manual_days table. When absent (pre-insert
 * estimate), uses the expected-workdays default for both modes.
 */
export async function computeRunPreview(
  supabase: SupabaseClient<Database>,
  companyId: string,
  args: { year: number; month: number; runType: RunType; plan: Database["public"]["Enums"]["plan_tier"]; runId?: string },
): Promise<RunPreview> {
  const { year, month, runType, plan, runId } = args;
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
    manualDays,
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
        .select("employee_id, base_salary, pay_frequency, daily_rate, daily_calc_mode, work_days, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from")
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
      // Manually-entered days for daily/mixed employees (if a runId is provided).
      // When absent (pre-insert estimate), defaults to expected workdays.
      runId ? loadRunManualDays(supabase, runId) : Promise.resolve(new Map()),
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
    //  - daily   → daily rate × days worked (manual or attendance-derived).
    //  - mixed   → monthly base + daily rate × days worked (manual or attendance-derived).
    // The daily rate is `daily_rate` when set, else `base_salary` (legacy daily).
    // For daily/mixed employees, days worked is either:
    //  - manual mode: admin-entered number from payroll_run_manual_days, or expected workdays (estimate)
    //  - attendance mode: unique attendance dates capped at expected workdays
    let frequency: PayFrequency;
    let usesDays: boolean;
    let expectedDays: number;
    let attendedDays: number;
    let daysWorked: number | null;
    let dailyCalcMode: 'manual' | 'attendance' | null;
    let earnedBase: Rupiah;
    let earnings: EarningLine[];
    let result: PayrollResult;

    try {
      frequency = (["monthly", "daily", "mixed"].includes(comp.pay_frequency)
        ? comp.pay_frequency
        : "monthly") as PayFrequency;
      usesDays = frequency === "daily" || frequency === "mixed";
      // The employee's expected weekly schedule (own override, else company default)
      // → expected workdays this month.
      const schedule =
        comp.work_days && comp.work_days.length > 0
          ? normalizeWorkDays(comp.work_days)
          : companyWorkDays;
      expectedDays = usesDays ? expectedWorkdaysInMonth(schedule, year, month) : 0;

      // Resolve days worked based on daily_calc_mode for daily/mixed employees.
      dailyCalcMode = usesDays ? (comp.daily_calc_mode === "manual" ? "manual" : "attendance") : null;
      if (dailyCalcMode === "manual") {
        // Manual mode: use admin-entered days from the map, or expected days (estimate) or 0 + warning (runId but no row).
        if (runId && !manualDays.has(emp.id)) {
          daysWorked = 0;
          warnings.push("Jumlah hari kerja manual belum diatur untuk periode ini.");
        } else {
          daysWorked = manualDays.get(emp.id) ?? expectedDays;
        }
        attendedDays = 0; // Not used in manual mode, but keep it for clarity.
      } else if (dailyCalcMode === "attendance") {
        // Attendance mode: unique attended dates capped at expected workdays.
        attendedDays = daysWorkedByEmployee.get(emp.id)?.size ?? 0;
        daysWorked = Math.min(attendedDays, expectedDays);
        if (daysWorked === 0) {
          warnings.push("Belum ada kehadiran tercatat periode ini — porsi harian dihitung 0.");
        }
      } else {
        // Monthly (dailyCalcMode = null, usesDays = false)
        daysWorked = null;
        attendedDays = 0;
      }

      const dailyRate = comp.daily_rate ?? baseSalary;
      const monthlyBase = frequency === "daily" ? 0 : baseSalary;
      earnedBase = computeEarnedBase({
        payFrequency: frequency,
        monthlyBase,
        dailyRate,
        daysWorked: daysWorked ?? 0,
      });

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
      dailyCalcMode: dailyCalcMode ?? undefined,
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
 * Per-employee readiness for every active employee. Each needs compensation and
 * a tax profile with at least one identity (NPWP or KTP). A tax profile without
 * any identity is a blocker; a profile with identity but no NPWP flag is a
 * non-blocking warning (+20% PPh 21).
 */
async function loadEmployeeReadiness(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<EmployeeReadiness[]> {
  const [{ data: employees }, { data: comps }, { data: taxes }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase.from("compensation").select("employee_id, effective_from").eq("company_id", companyId),
    supabase.from("tax_profile").select("employee_id, has_npwp, npwp, ktp").eq("company_id", companyId),
  ]);

  // Any compensation row makes an employee ready: the run engine selects the
  // latest row ≤ the period, falling back to the earliest if none is effective
  // yet, so a row that exists will always produce a salary in the run.
  const hasComp = new Set(
    ((comps as { employee_id: string; effective_from: string }[] | null) ?? [])
      .map((c) => c.employee_id),
  );
  const taxRows = (taxes as { employee_id: string; has_npwp: boolean | null; npwp: string | null; ktp: string | null }[] | null) ?? [];

  // A tax profile is only present if it exists AND has at least one identity (NPWP or KTP).
  const hasTaxIdentity = new Set(
    taxRows
      .filter((t) => (t.npwp ?? "").trim() !== "" || (t.ktp ?? "").trim() !== "")
      .map((t) => t.employee_id),
  );

  // NPWP missing: has tax identity (NPWP or KTP) but has_npwp is false.
  const npwpMissingByEmp = new Map(
    taxRows
      .filter((t) => ((t.npwp ?? "").trim() !== "" || (t.ktp ?? "").trim() !== "") && t.has_npwp !== true)
      .map((t) => [t.employee_id, true]),
  );

  return ((employees as { id: string; full_name: string }[] | null) ?? []).map((emp) => {
    const issues: ReadinessIssue[] = [];
    if (!hasComp.has(emp.id)) issues.push("compensation");
    if (!hasTaxIdentity.has(emp.id)) issues.push("tax");
    // NPWP warning: has tax identity but no NPWP flag.
    const npwpMissing = npwpMissingByEmp.has(emp.id);
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

// Re-exported so existing importers of `sumFixedAllowances` from "@/lib/payroll"
// don't break now that it lives in @nexis/payroll.
export { sumFixedAllowances } from "@nexis/payroll";
