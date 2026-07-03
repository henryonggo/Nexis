import { z } from "zod";
import type { Rupiah } from "@nexis/money";
import {
  buildPayrollConfig,
  computeMonthlyPayroll,
  ptkpCategory,
  type JkkRiskClass,
  type PayrollResult,
  type PtkpStatus,
  type TerCategory,
} from "@nexis/payroll";
import { defineTool } from "../tool";
import type { HaltReason } from "../result";

/**
 * Read-only PPh 21 (TER method) computation for ONE monthly-paid employee.
 *
 * v0 scope (Week 1, docs/pivot/PIVOT-PHASE-1.md): gross = base salary + fixed
 * allowances + taxable FIXED configurable earnings (manual per-employee rows,
 * same resolution rule as apps/web/lib/earnings.ts). The tool HALTS — never
 * silently under-computes — when any earning source it cannot compute exactly
 * exists for the period (approved overtime, percentage earnings, earning-group
 * assignment) or when a required input is missing. This is stricter than the
 * interactive run preview (apps/web/lib/payroll.ts), which substitutes TK/0 /
 * "low" defaults with warnings; an agent result feeding an approval queue must
 * be exact or absent.
 */

const PTKP_STATUSES = new Set<PtkpStatus>([
  "TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3",
]);
const JKK_RISK_CLASSES = new Set<JkkRiskClass>([
  "very_low", "low", "medium", "high", "very_high",
]);

function periodStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function periodEnd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Reference row is in force on `date` (same rule as apps/web/lib/payroll.ts). */
function effectiveOn<T extends { effective_from: string; effective_to: string | null }>(
  rows: T[],
  date: string,
): T[] {
  return rows.filter(
    (r) => r.effective_from <= date && (r.effective_to == null || r.effective_to >= date),
  );
}

/** Sum a compensation.fixed_allowances JSON blob (number | {amount}[] | map). */
function sumFixedAllowances(value: unknown): Rupiah {
  if (typeof value === "number") return Math.round(value);
  if (Array.isArray(value)) {
    return value.reduce<number>((acc, item) => {
      const amount =
        typeof item === "number" ? item : Number((item as { amount?: unknown })?.amount ?? 0);
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

/** One resolved configurable earning, echoed for the approval queue. */
export interface EarningLineOut {
  label: string;
  amount: Rupiah;
  taxable: boolean;
}

export interface Pph21Output {
  employee: { id: string; fullName: string };
  period: { year: number; month: number };
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

const inputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const computePph21ForEmployee = defineTool<z.infer<typeof inputSchema>, Pph21Output>({
  name: "compute_pph21_for_employee",
  description:
    "Compute one monthly-paid employee's statutory monthly payroll breakdown (gross, BPJS, PPh 21 TER, net) for a period. Read-only; halts on any missing input instead of estimating.",
  requiresApproval: false,
  input: inputSchema,
  async run(input, ctx) {
    const start = periodStart(input.year, input.month);
    const end = periodEnd(input.year, input.month);
    const halts: HaltReason[] = [];

    const [empRes, compRes, taxRes, settingsRes, bpjsRes, terRes, otRes, earnTypesRes, earnRes, earnGroupRes] =
      await Promise.all([
        ctx.supabase
          .from("employees")
          .select("id, full_name, status")
          .eq("company_id", ctx.companyId)
          .eq("id", input.employeeId)
          .maybeSingle(),
        ctx.supabase
          .from("compensation")
          .select(
            "employee_id, base_salary, pay_frequency, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from",
          )
          .eq("company_id", ctx.companyId)
          .eq("employee_id", input.employeeId),
        ctx.supabase
          .from("tax_profile")
          .select("ptkp_status, has_npwp")
          .eq("company_id", ctx.companyId)
          .eq("employee_id", input.employeeId)
          .maybeSingle(),
        ctx.supabase
          .from("company_settings")
          .select("jkk_risk_class")
          .eq("company_id", ctx.companyId)
          .maybeSingle(),
        ctx.supabase
          .from("bpjs_config")
          .select("key, rate_bps, amount, effective_from, effective_to"),
        ctx.supabase
          .from("ter_rates")
          .select("category, income_lower, rate_bps, effective_from, effective_to"),
        ctx.supabase
          .from("overtime_entries")
          .select("id")
          .eq("company_id", ctx.companyId)
          .eq("employee_id", input.employeeId)
          .eq("is_approved", true)
          .gte("date", start)
          .lte("date", end)
          .limit(1),
        ctx.supabase
          .from("custom_earning_types")
          .select("id, name, calc, amount, rate_bps, base, taxable, active")
          .eq("company_id", ctx.companyId),
        ctx.supabase
          .from("employee_earning")
          .select("custom_type_id, amount_override, enabled")
          .eq("company_id", ctx.companyId)
          .eq("employee_id", input.employeeId),
        ctx.supabase
          .from("employee_earning_group")
          .select("group_id")
          .eq("company_id", ctx.companyId)
          .eq("employee_id", input.employeeId)
          .maybeSingle(),
      ]);

    for (const [label, res] of [
      ["employees", empRes],
      ["compensation", compRes],
      ["tax_profile", taxRes],
      ["company_settings", settingsRes],
      ["bpjs_config", bpjsRes],
      ["ter_rates", terRes],
      ["overtime_entries", otRes],
      ["custom_earning_types", earnTypesRes],
      ["employee_earning", earnRes],
      ["employee_earning_group", earnGroupRes],
    ] as const) {
      if (res.error) throw new Error(`${label}: ${res.error.message}`);
    }

    const employee = empRes.data;
    if (!employee) {
      return {
        halt: [
          {
            code: "employee_not_found",
            message: `No employee ${input.employeeId} visible in company ${ctx.companyId}.`,
            needs: "A valid employee id from fetch_employee_roster.",
          },
        ],
      };
    }
    if (employee.status !== "active") {
      halts.push({
        code: "employee_not_active",
        message: `${employee.full_name} has status "${employee.status}" — not part of an active payroll run.`,
      });
    }

    // Latest compensation effective on/before the period end. Unlike the run
    // preview, there is NO fallback to a future-effective row — that would be
    // paying from a contract that isn't in force yet.
    let comp: NonNullable<typeof compRes.data>[number] | null = null;
    for (const row of compRes.data ?? []) {
      if (row.effective_from <= end && (!comp || row.effective_from > comp.effective_from)) {
        comp = row;
      }
    }
    if (!comp) {
      halts.push({
        code: "missing_compensation",
        message: `${employee.full_name} has no compensation row in force on ${end}.`,
        needs: "compensation row (base_salary, pay_frequency) effective on/before the period end",
      });
    } else if (comp.pay_frequency !== "monthly") {
      halts.push({
        code: "unsupported_pay_frequency",
        message: `${employee.full_name} is paid "${comp.pay_frequency}"; v0 of this tool computes monthly-paid employees only (daily/mixed needs attendance-derived earned base).`,
      });
    }

    const tax = taxRes.data;
    if (!tax) {
      halts.push({
        code: "missing_tax_profile",
        message: `${employee.full_name} has no tax profile (PTKP status, NPWP).`,
        needs: "tax_profile row (ptkp_status, has_npwp)",
      });
    } else if (!PTKP_STATUSES.has(tax.ptkp_status as PtkpStatus)) {
      halts.push({
        code: "invalid_ptkp_status",
        message: `Unknown PTKP status "${tax.ptkp_status}" for ${employee.full_name}.`,
        needs: "one of TK/0..TK/3, K/0..K/3",
      });
    }

    const rawRisk = settingsRes.data?.jkk_risk_class;
    if (!rawRisk || !JKK_RISK_CLASSES.has(rawRisk as JkkRiskClass)) {
      halts.push({
        code: "missing_jkk_risk_class",
        message: `Company JKK risk class is ${rawRisk ? `unknown ("${rawRisk}")` : "not set"} in company_settings.`,
        needs: "company_settings.jkk_risk_class ∈ very_low..very_high",
      });
    }

    if ((otRes.data ?? []).length > 0) {
      halts.push({
        code: "overtime_not_supported",
        message: `${employee.full_name} has approved overtime in ${start}..${end}; v0 gross excludes overtime, which would understate PPh 21.`,
      });
    }

    // Configurable earnings — same resolution rule as apps/web/lib/earnings.ts
    // (group assignment wins, else manual enabled rows; inactive types drop
    // out). v0 computes fixed-amount earnings exactly and halts on anything it
    // can't: a group assignment (shared template semantics not ported yet) or
    // a percentage earning (its base definition follows earned-base logic that
    // lands with the full-cycle tool set in Week 2).
    const earnings: EarningLineOut[] = [];
    if (earnGroupRes.data?.group_id) {
      halts.push({
        code: "earning_groups_not_supported",
        message: `${employee.full_name} is assigned to an earning group; v0 resolves manual earnings only.`,
      });
    } else {
      const typeById = new Map((earnTypesRes.data ?? []).map((t) => [t.id, t] as const));
      for (const row of earnRes.data ?? []) {
        if (!row.enabled || !row.custom_type_id) continue;
        const type = typeById.get(row.custom_type_id);
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

    const bpjsRows = effectiveOn(bpjsRes.data ?? [], start);
    const terRows = effectiveOn(terRes.data ?? [], start);
    if (bpjsRows.length === 0 || terRows.length === 0) {
      halts.push({
        code: "missing_rate_config",
        message: `No ${bpjsRows.length === 0 ? "bpjs_config" : "ter_rates"} reference rows in force on ${start}.`,
        needs: "seeded bpjs_config + ter_rates covering the period",
      });
    }

    if (halts.length > 0 || !comp || !tax) return { halt: halts };

    const config = buildPayrollConfig(bpjsRows, terRows);
    const ptkpStatus = tax.ptkp_status as PtkpStatus;
    const jkkRiskClass = rawRisk as JkkRiskClass;
    const baseSalary = Math.round(comp.base_salary);
    // Taxable earning lines flow into gross via fixedAllowances — the same
    // path computeRunPreview uses — so PPh 21 sees the full taxable gross.
    const taxableEarnings = earnings.reduce(
      (acc, l) => acc + (l.taxable ? l.amount : 0),
      0,
    );
    const nonTaxableEarnings = earnings.reduce(
      (acc, l) => acc + (l.taxable ? 0 : l.amount),
      0,
    );
    const fixedAllowances = sumFixedAllowances(comp.fixed_allowances) + taxableEarnings;

    const result = computeMonthlyPayroll(
      {
        baseSalary,
        fixedAllowances,
        overtimePay: 0,
        ptkpStatus,
        hasNpwp: tax.has_npwp,
        jkkRiskClass,
        bpjsKesEnrolled: comp.bpjs_kes_enrolled,
        jhtEnrolled: comp.jht_enrolled,
        jpEnrolled: comp.jp_enrolled,
      },
      config,
    );

    return {
      data: {
        employee: { id: employee.id, fullName: employee.full_name },
        period: { year: input.year, month: input.month },
        inputs: {
          baseSalary,
          fixedAllowances,
          gross: result.gross,
          ptkpStatus,
          terCategory: ptkpCategory(ptkpStatus),
          hasNpwp: tax.has_npwp,
          jkkRiskClass,
        },
        earnings,
        nonTaxableEarnings,
        result,
      },
    };
  },
});
