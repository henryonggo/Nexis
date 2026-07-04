import { z } from "zod";
import { buildPayrollConfig } from "@nexis/payroll";
import { defineTool } from "../tool";
import type { HaltReason } from "../result";
import {
  computeEmployeeStatutory,
  effectiveOn,
  periodEnd,
  periodStart,
  type EarningLineOut,
  type StatutoryLine,
} from "./statutory";

/**
 * Read-only PPh 21 (TER method) computation for ONE monthly-paid employee.
 *
 * v0 scope (docs/pivot/PIVOT-PHASE-1.md): gross = base salary + fixed
 * allowances + taxable FIXED configurable earnings (manual per-employee rows,
 * same resolution rule as apps/web/lib/earnings.ts). The tool HALTS — never
 * silently under-computes — when any earning source it cannot compute exactly
 * exists for the period (approved overtime, percentage earnings, earning-group
 * assignment) or when a required input is missing. This is stricter than the
 * interactive run preview (apps/web/lib/payroll.ts), which substitutes TK/0 /
 * "low" defaults with warnings; an agent result feeding an approval queue must
 * be exact or absent.
 *
 * The computation itself lives in ./statutory.ts, shared with
 * compute_payroll_run so both tools provably apply identical rules.
 */

export type { EarningLineOut };

export interface Pph21Output {
  employee: { id: string; fullName: string };
  period: { year: number; month: number };
  inputs: StatutoryLine["inputs"];
  earnings: EarningLineOut[];
  /** Total of non-taxable earning lines — reported, never folded into gross. */
  nonTaxableEarnings: number;
  result: StatutoryLine["result"];
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

    const halts: HaltReason[] = [];
    if (employee.status !== "active") {
      halts.push({
        code: "employee_not_active",
        message: `${employee.full_name} has status "${employee.status}" — not part of an active payroll run.`,
      });
    }

    const bpjsRows = effectiveOn(bpjsRes.data ?? [], start);
    const terRows = effectiveOn(terRes.data ?? [], start);
    if (bpjsRows.length === 0 || terRows.length === 0) {
      halts.push({
        code: "missing_rate_config",
        message: `No ${bpjsRows.length === 0 ? "bpjs_config" : "ter_rates"} reference rows in force on ${start}.`,
        needs: "seeded bpjs_config + ter_rates covering the period",
      });
      return { halt: halts };
    }

    const outcome = computeEmployeeStatutory({
      employee,
      comps: compRes.data ?? [],
      tax: taxRes.data,
      jkkRiskClassRaw: settingsRes.data?.jkk_risk_class,
      earningTypesById: new Map((earnTypesRes.data ?? []).map((t) => [t.id, t] as const)),
      manualEarnings: earnRes.data ?? [],
      hasGroupAssignment: Boolean(earnGroupRes.data?.group_id),
      hasApprovedOvertime: (otRes.data ?? []).length > 0,
      config: buildPayrollConfig(bpjsRows, terRows),
      periodEnd: end,
    });

    if ("halts" in outcome) return { halt: [...halts, ...outcome.halts] };
    if (halts.length > 0) return { halt: halts };

    const { line } = outcome;
    return {
      data: {
        employee: { id: line.employeeId, fullName: line.fullName },
        period: { year: input.year, month: input.month },
        inputs: line.inputs,
        earnings: line.earnings,
        nonTaxableEarnings: line.nonTaxableEarnings,
        result: line.result,
      },
    };
  },
});
