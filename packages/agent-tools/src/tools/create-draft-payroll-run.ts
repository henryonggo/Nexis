import { z } from "zod";
import { defineTool } from "../tool";
import type { HaltReason } from "../result";
import { loadAndComputeRun, type PayrollRunOutput } from "./compute-payroll-run";

/**
 * FIRST MUTATING TOOL (requires_approval): create — or reactivate — the draft
 * payroll run for a period. Mirrors the createDraftRun server action
 * (apps/web/app/(app)/payroll/actions.ts): one run per (company, year, month);
 * an existing cancelled/failed run is reactivated in place so the period's
 * uniqueness constraint holds; the effective rate config is snapshotted onto
 * the run for reproducibility, in the exact shape the payroll worker reads
 * ({ effectiveDate, runType, config }).
 *
 * Gates, all halt — never degrade:
 *  - the full statutory compute must succeed for every active employee
 *    (strictly stronger than the app's G7 readiness on compensation/tax);
 *  - G7 bank-account parity: every active employee needs a bank account with
 *    an account number (payment-side requirement the compute doesn't see);
 *  - an active/finalized run already holding the period.
 *
 * v0 is monthly runs only (workflow zero); THR runs stay in the app UI.
 */

export interface CreateDraftRunOutput {
  runId: string;
  /** true when a cancelled/failed run for the period was reactivated. */
  reactivated: boolean;
  period: { year: number; month: number };
  employeeCount: number;
  totals: PayrollRunOutput["totals"];
}

const inputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const createDraftPayrollRun = defineTool<z.infer<typeof inputSchema>, CreateDraftRunOutput>({
  name: "create_draft_payroll_run",
  description:
    "Create (or reactivate) the draft monthly payroll run for a period, snapshotting rates and totals. MUTATES STATE — requires an approval token. Halts if any active employee cannot be computed exactly or lacks a bank account.",
  requiresApproval: true,
  input: inputSchema,
  async run(input, ctx) {
    const computed = await loadAndComputeRun(input, ctx);
    if ("halt" in computed) return { halt: computed.halt };

    const [bankRes, existingRes] = await Promise.all([
      ctx.supabase
        .from("bank_accounts")
        .select("employee_id, account_no")
        .eq("company_id", ctx.companyId),
      ctx.supabase
        .from("payroll_runs")
        .select("id, status")
        .eq("company_id", ctx.companyId)
        .eq("period_year", input.year)
        .eq("period_month", input.month)
        .maybeSingle(),
    ]);
    if (bankRes.error) throw new Error(`bank_accounts: ${bankRes.error.message}`);
    if (existingRes.error) throw new Error(`payroll_runs: ${existingRes.error.message}`);

    const halts: HaltReason[] = [];

    // G7 parity: the compute gates on tax/compensation; paying also needs a
    // bank account with an account number.
    const banked = new Set(
      (bankRes.data ?? []).filter((b) => b.account_no).map((b) => b.employee_id),
    );
    for (const line of computed.lines) {
      if (!banked.has(line.employeeId)) {
        halts.push({
          code: "missing_bank_account",
          message: `${line.fullName} has no bank account with an account number.`,
          needs: "bank_accounts row (account_no) for this employee",
        });
      }
    }

    const existing = existingRes.data;
    if (existing && existing.status !== "cancelled" && existing.status !== "failed") {
      halts.push({
        code: "run_already_exists",
        message: `A payroll run for ${input.year}-${String(input.month).padStart(2, "0")} already exists with status "${existing.status}" (id ${existing.id}).`,
      });
    }
    if (halts.length > 0) return { halt: halts };

    const runFields = {
      status: "draft" as const,
      // Exact shape computeRunPreview snapshots and the worker reads.
      config_snapshot: {
        effectiveDate: computed.effectiveDate,
        runType: "monthly",
        config: {
          bpjsKesEmployeeBps: computed.config.bpjsKesEmployeeBps,
          bpjsKesEmployerBps: computed.config.bpjsKesEmployerBps,
          jhtEmployeeBps: computed.config.jhtEmployeeBps,
          jhtEmployerBps: computed.config.jhtEmployerBps,
          jpEmployeeBps: computed.config.jpEmployeeBps,
          jpEmployerBps: computed.config.jpEmployerBps,
          jkmEmployerBps: computed.config.jkmEmployerBps,
          jkkEmployerBpsByRisk: computed.config.jkkEmployerBpsByRisk,
          bpjsKesCap: computed.config.bpjsKesCap,
          jpCap: computed.config.jpCap,
        },
      },
      total_gross: computed.totals.gross,
      total_bpjs_employee: computed.totals.bpjsEmployee,
      total_bpjs_employer: computed.totals.bpjsEmployer,
      total_pph21: computed.totals.pph21,
      total_net: computed.totals.net,
    };

    if (existing) {
      const { error } = await ctx.supabase
        .from("payroll_runs")
        .update({ ...runFields, completed_at: null })
        .eq("id", existing.id);
      if (error) throw new Error(`payroll_runs update: ${error.message}`);
      return {
        data: {
          runId: existing.id,
          reactivated: true,
          period: { year: input.year, month: input.month },
          employeeCount: computed.lines.length,
          totals: computed.totals,
        },
      };
    }

    const { data: inserted, error } = await ctx.supabase
      .from("payroll_runs")
      .insert({
        company_id: ctx.companyId,
        period_year: input.year,
        period_month: input.month,
        ...runFields,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`payroll_runs insert: ${error?.message ?? "no row returned"}`);
    }

    return {
      data: {
        runId: inserted.id,
        reactivated: false,
        period: { year: input.year, month: input.month },
        employeeCount: computed.lines.length,
        totals: computed.totals,
      },
    };
  },
});
