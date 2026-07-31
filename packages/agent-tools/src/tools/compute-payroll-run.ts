import { z } from "zod";
import type { Rupiah } from "@nexis/money";
import { buildPayrollConfig, type PayrollConfig } from "@nexis/payroll";
import { defineTool, type ToolContext } from "../tool";
import type { HaltReason } from "../result";
import { loadStatutoryInputs } from "./load-inputs";
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

export interface ComputedRun {
  lines: StatutoryLine[];
  totals: PayrollRunOutput["totals"];
  config: PayrollConfig;
  /** First day of the period — the reference effective-date (YYYY-MM-DD). */
  effectiveDate: string;
}

/**
 * The load + compute core, shared with create_draft_payroll_run so the draft
 * a mutation writes is byte-identical to the numbers the read-only tool showed
 * the owner. All-or-nothing: any per-employee halt fails the whole run.
 */
export async function loadAndComputeRun(
  input: { year: number; month: number },
  ctx: ToolContext,
): Promise<{ halt: HaltReason[] } | ComputedRun> {
    const start = periodStart(input.year, input.month);
    const end = periodEnd(input.year, input.month);

    const { empRes, compRes, taxRes, settingsRes, bpjsRes, terRes, otRes, earnTypesRes, earnRes, earnGroupRes } =
      await loadStatutoryInputs(ctx, { start, end });

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
        companyWorkDaysRaw: settingsRes.data?.work_days,
        earningTypesById,
        manualEarnings: manualByEmployee.get(emp.id) ?? [],
        hasGroupAssignment: groupAssigned.has(emp.id),
        hasApprovedOvertime: otEmployees.has(emp.id),
        config,
        periodStart: start,
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

    return { lines, totals, config, effectiveDate: start };
}

export const computePayrollRun = defineTool<z.infer<typeof inputSchema>, PayrollRunOutput>({
  name: "compute_payroll_run",
  description:
    "Compute the statutory monthly payroll breakdown (gross, BPJS, PPh 21 TER, net) for EVERY active employee in a period, with company totals. Read-only; halts with all reasons if any employee cannot be computed exactly.",
  requiresApproval: false,
  input: inputSchema,
  async run(input, ctx) {
    const computed = await loadAndComputeRun(input, ctx);
    if ("halt" in computed) return { halt: computed.halt };
    return {
      data: {
        companyId: ctx.companyId,
        period: { year: input.year, month: input.month },
        lines: computed.lines,
        totals: computed.totals,
      },
    };
  },
});
