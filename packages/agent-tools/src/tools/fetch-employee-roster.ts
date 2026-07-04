import { z } from "zod";
import type { Rupiah } from "@nexis/money";
import { defineTool } from "../tool";

/**
 * Read-only roster fetch: every employee with data-completeness flags. This is
 * deliberately non-halting — a roster read reports gaps (missing compensation,
 * missing tax profile) as data so the orchestrator can plan the fixes, whereas
 * a *computation* over the same gaps must halt (see compute_pph21_for_employee).
 */

export interface RosterLine {
  employeeId: string;
  employeeNo: string | null;
  fullName: string;
  status: string;
  joinDate: string | null;
  /** null when no compensation row exists yet. */
  payFrequency: string | null;
  /** Integer rupiah; null when no compensation row exists yet. */
  baseSalary: Rupiah | null;
  hasCompensation: boolean;
  hasTaxProfile: boolean;
  /** null when no tax profile row exists yet. */
  ptkpStatus: string | null;
  hasNpwp: boolean | null;
}

export interface RosterOutput {
  companyId: string;
  employees: RosterLine[];
  /** Employees a payroll computation would halt on, for planning. */
  incomplete: { employeeId: string; missing: ("compensation" | "tax_profile")[] }[];
}

const inputSchema = z.object({
  /** Default false: active employees only, matching payroll-run scope. */
  includeInactive: z.boolean().optional().default(false),
});

export const fetchEmployeeRoster = defineTool<z.infer<typeof inputSchema>, RosterOutput>({
  name: "fetch_employee_roster",
  description:
    "Fetch the company's employee roster with pay-frequency, base salary (integer rupiah) and data-completeness flags (compensation, tax profile). Read-only.",
  requiresApproval: false,
  input: inputSchema,
  async run(input, ctx) {
    const employeeBase = ctx.supabase
      .from("employees")
      .select("id, employee_no, full_name, status, join_date")
      .eq("company_id", ctx.companyId);
    const employeeQuery = (
      input.includeInactive ? employeeBase : employeeBase.eq("status", "active")
    ).order("full_name", { ascending: true });

    const [employeesRes, compsRes, taxesRes] = await Promise.all([
      employeeQuery,
      ctx.supabase
        .from("compensation")
        .select("employee_id, base_salary, pay_frequency, effective_from")
        .eq("company_id", ctx.companyId),
      ctx.supabase
        .from("tax_profile")
        .select("employee_id, ptkp_status, has_npwp")
        .eq("company_id", ctx.companyId),
    ]);

    if (employeesRes.error) throw new Error(`employees: ${employeesRes.error.message}`);
    if (compsRes.error) throw new Error(`compensation: ${compsRes.error.message}`);
    if (taxesRes.error) throw new Error(`tax_profile: ${taxesRes.error.message}`);

    // Latest compensation row per employee by effective_from (same rule the
    // run preview and worker use — see apps/web/lib/payroll.ts).
    const compByEmployee = new Map<
      string,
      { base_salary: number; pay_frequency: string; effective_from: string }
    >();
    for (const row of compsRes.data ?? []) {
      const prev = compByEmployee.get(row.employee_id);
      if (!prev || row.effective_from > prev.effective_from) {
        compByEmployee.set(row.employee_id, row);
      }
    }
    const taxByEmployee = new Map(
      (taxesRes.data ?? []).map((t) => [t.employee_id, t] as const),
    );

    const employees: RosterLine[] = (employeesRes.data ?? []).map((emp) => {
      const comp = compByEmployee.get(emp.id);
      const tax = taxByEmployee.get(emp.id);
      return {
        employeeId: emp.id,
        employeeNo: emp.employee_no,
        fullName: emp.full_name,
        status: emp.status,
        joinDate: emp.join_date,
        payFrequency: comp?.pay_frequency ?? null,
        baseSalary: comp ? Math.round(comp.base_salary) : null,
        hasCompensation: comp !== undefined,
        hasTaxProfile: tax !== undefined,
        ptkpStatus: tax?.ptkp_status ?? null,
        hasNpwp: tax?.has_npwp ?? null,
      };
    });

    const incomplete = employees
      .filter((e) => !e.hasCompensation || !e.hasTaxProfile)
      .map((e) => ({
        employeeId: e.employeeId,
        missing: [
          ...(!e.hasCompensation ? (["compensation"] as const) : []),
          ...(!e.hasTaxProfile ? (["tax_profile"] as const) : []),
        ],
      }));

    return { data: { companyId: ctx.companyId, employees, incomplete } };
  },
});
