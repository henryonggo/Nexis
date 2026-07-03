import { z } from "zod";
import type { Rupiah } from "@nexis/money";
import { buildPayrollConfig } from "@nexis/payroll";
import { defineTool } from "../tool";
import type { HaltReason } from "../result";
import {
  computeEmployeeStatutory,
  effectiveOn,
  periodEnd,
  periodStart,
  type ManualEarningRow,
  type StatutoryLine,
} from "./statutory";

/**
 * Read-only whole-roster statutory computation for one period — the number
 * the approval queue shows the owner before a run is created. Loads the
 * company's data once (bulk, mirroring apps/web/lib/payroll.ts's
 * computeRunPreview) and applies the shared per-employee core.
 *
 * ALL-OR-NOTHING (pivot ground rule 1): if ANY active employee halts, the
 * whole tool halts with every reason collected — a total that silently omits
 * an employee is a wrong total, not a partial answer. The orchestrator fixes
 * the gaps (or the owner excludes the employee explicitly in a later tool
 * version) and re-runs.
 */

export interface PayrollRunOutput {
  companyId: string;
  period: { year: number; month: number };
  lines: StatutoryLine[];
  totals: {
    gross: Rupiah;
    /** kes + jht + jp, employee side. */
    bpjsEmployee: Rupiah;
    /** kes + jht + jp + jkk + jkm, employer side. */
    bpjsEmployer: Rupiah;
    pph21: Rupiah;
    /** Statutory net (excludes non-taxable earnings, paid post-tax). */
    net: Rupiah;
    nonTaxableEarnings: Rupiah;
  };
}

const inputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const computePayrollRun = defineTool<z.infer<typeof inputSchema>, PayrollRunOutput>({
  name: "compute_payroll_run",
  description:
    "Compute the statutory monthly payroll breakdown (gross, BPJS, PPh 21 TER, net) for EVERY active employee in a period, with company totals. Read-only; halts with all reasons if any employee cannot be computed exactly.",
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
          .eq("status", "active")
          .order("full_name", { ascending: true }),
        ctx.supabase
          .from("compensation")
          .select(
            "employee_id, base_salary, pay_frequency, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from",
          )
          .eq("company_id", ctx.companyId),
        ctx.supabase
          .from("tax_profile")
          .select("employee_id, ptkp_status, has_npwp")
          .eq("company_id", ctx.companyId),
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
          .select("employee_id")
          .eq("company_id", ctx.companyId)
          .eq("is_approved", true)
          .gte("date", start)
          .lte("date", end),
        ctx.supabase
          .from("custom_earning_types")
          .select("id, name, calc, amount, rate_bps, base, taxable, active")
          .eq("company_id", ctx.companyId),
        ctx.supabase
          .from("employee_earning")
          .select("employee_id, custom_type_id, amount_override, enabled")
          .eq("company_id", ctx.companyId),
        ctx.supabase
          .from("employee_earning_group")
          .select("employee_id, group_id")
          .eq("company_id", ctx.companyId),
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

    const employees = empRes.data ?? [];
    if (employees.length === 0) {
      return {
        halt: [
          {
            code: "empty_roster",
            message: `No active employees in company ${ctx.companyId} — nothing to compute.`,
          },
        ],
      };
    }

    const bpjsRows = effectiveOn(bpjsRes.data ?? [], start);
    const terRows = effectiveOn(terRes.data ?? [], start);
    if (bpjsRows.length === 0 || terRows.length === 0) {
      return {
        halt: [
          {
            code: "missing_rate_config",
            message: `No ${bpjsRows.length === 0 ? "bpjs_config" : "ter_rates"} reference rows in force on ${start}.`,
            needs: "seeded bpjs_config + ter_rates covering the period",
          },
        ],
      };
    }
    const config = buildPayrollConfig(bpjsRows, terRows);

    // Index the bulk loads per employee.
    const compsByEmployee = new Map<string, NonNullable<typeof compRes.data>>();
    for (const row of compRes.data ?? []) {
      const list = compsByEmployee.get(row.employee_id) ?? [];
      list.push(row);
      compsByEmployee.set(row.employee_id, list);
    }
    const taxByEmployee = new Map(
      (taxRes.data ?? []).map((t) => [t.employee_id, t] as const),
    );
    const otEmployees = new Set((otRes.data ?? []).map((o) => o.employee_id));
    const earningTypesById = new Map((earnTypesRes.data ?? []).map((t) => [t.id, t] as const));
    const manualByEmployee = new Map<string, ManualEarningRow[]>();
    for (const row of earnRes.data ?? []) {
      const list = manualByEmployee.get(row.employee_id) ?? [];
      list.push(row);
      manualByEmployee.set(row.employee_id, list);
    }
    const groupAssigned = new Set(
      (earnGroupRes.data ?? []).map((g) => g.employee_id),
    );

    const lines: StatutoryLine[] = [];
    const halts: HaltReason[] = [];
    for (const emp of employees) {
      const outcome = computeEmployeeStatutory({
        employee: emp,
        comps: compsByEmployee.get(emp.id) ?? [],
        tax: taxByEmployee.get(emp.id) ?? null,
        jkkRiskClassRaw: settingsRes.data?.jkk_risk_class,
        earningTypesById,
        manualEarnings: manualByEmployee.get(emp.id) ?? [],
        hasGroupAssignment: groupAssigned.has(emp.id),
        hasApprovedOvertime: otEmployees.has(emp.id),
        config,
        periodEnd: end,
      });
      if ("halts" in outcome) halts.push(...outcome.halts);
      else lines.push(outcome.line);
    }

    if (halts.length > 0) return { halt: halts };

    const totals = lines.reduce(
      (acc, l) => ({
        gross: acc.gross + l.result.gross,
        bpjsEmployee:
          acc.bpjsEmployee + l.result.bpjsKesEmployee + l.result.jhtEmployee + l.result.jpEmployee,
        bpjsEmployer:
          acc.bpjsEmployer +
          l.result.bpjsKesEmployer +
          l.result.jhtEmployer +
          l.result.jpEmployer +
          l.result.jkkEmployer +
          l.result.jkmEmployer,
        pph21: acc.pph21 + l.result.pph21,
        net: acc.net + l.result.netPay,
        nonTaxableEarnings: acc.nonTaxableEarnings + l.nonTaxableEarnings,
      }),
      { gross: 0, bpjsEmployee: 0, bpjsEmployer: 0, pph21: 0, net: 0, nonTaxableEarnings: 0 },
    );

    return {
      data: {
        companyId: ctx.companyId,
        period: { year: input.year, month: input.month },
        lines,
        totals,
      },
    };
  },
});
