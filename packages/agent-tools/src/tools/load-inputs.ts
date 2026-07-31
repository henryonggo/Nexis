import type { ToolContext } from "../tool";
import type { CompRow, EarningTypeRow, ManualEarningRow, TaxRow } from "./statutory";

/**
 * ONE parameterized loader for the multi-table Supabase read that both
 * compute_payroll_run (whole roster) and compute_pph21_for_employee (one
 * employee) need before they can call computeEmployeeStatutory. Same tables,
 * same column lists, same error handling as before this was extracted — this
 * is a refactor, not a redesign (NEXT-2, docs/pivot/ROADMAP.md).
 *
 * Pass `employeeId` for the single-employee shape (filtered rows, no
 * redundant employee_id column, .maybeSingle()/.limit(1) where the caller
 * already knows there is at most one row); omit it for the whole-roster
 * shape (active employees only, employee_id kept on every table so the
 * caller can index rows per employee).
 */

interface LoadResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface EmployeeRow {
  id: string;
  full_name: string;
  status: string;
  /** Mid-month-hire proration input (ADR 0006) — confirms a comp row's effective_from is a genuine hire. */
  join_date: string | null;
}

export interface CompanySettingsRow {
  jkk_risk_class: string | null;
  /** Company default weekly schedule (ISO weekdays); mid-month-hire proration fallback (ADR 0006). */
  work_days: number[] | null;
}

export interface BpjsConfigRow {
  key: string;
  rate_bps: number | null;
  amount: number | null;
  effective_from: string;
  effective_to: string | null;
}

export interface TerRateRow {
  category: string;
  income_lower: number;
  rate_bps: number;
  effective_from: string;
  effective_to: string | null;
}

export interface RosterInputs {
  empRes: LoadResult<EmployeeRow[]>;
  compRes: LoadResult<CompRow[]>;
  taxRes: LoadResult<(TaxRow & { employee_id: string })[]>;
  settingsRes: LoadResult<CompanySettingsRow>;
  bpjsRes: LoadResult<BpjsConfigRow[]>;
  terRes: LoadResult<TerRateRow[]>;
  otRes: LoadResult<{ employee_id: string }[]>;
  earnTypesRes: LoadResult<EarningTypeRow[]>;
  earnRes: LoadResult<(ManualEarningRow & { employee_id: string })[]>;
  earnGroupRes: LoadResult<{ employee_id: string; group_id: string }[]>;
}

export interface EmployeeInputs {
  empRes: LoadResult<EmployeeRow>;
  compRes: LoadResult<CompRow[]>;
  taxRes: LoadResult<TaxRow>;
  settingsRes: LoadResult<CompanySettingsRow>;
  bpjsRes: LoadResult<BpjsConfigRow[]>;
  terRes: LoadResult<TerRateRow[]>;
  otRes: LoadResult<{ id: string }[]>;
  earnTypesRes: LoadResult<EarningTypeRow[]>;
  earnRes: LoadResult<ManualEarningRow[]>;
  earnGroupRes: LoadResult<{ group_id: string } | null>;
}

function assertNoLoadErrors(
  results: readonly (readonly [string, { error: { message: string } | null }])[],
): void {
  for (const [label, res] of results) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
  }
}

export function loadStatutoryInputs(
  ctx: ToolContext,
  period: { start: string; end: string },
): Promise<RosterInputs>;
export function loadStatutoryInputs(
  ctx: ToolContext,
  period: { start: string; end: string },
  employeeId: string,
): Promise<EmployeeInputs>;
export async function loadStatutoryInputs(
  ctx: ToolContext,
  period: { start: string; end: string },
  employeeId?: string,
): Promise<RosterInputs | EmployeeInputs> {
  if (employeeId !== undefined) {
    const [
      empRes,
      compRes,
      taxRes,
      settingsRes,
      bpjsRes,
      terRes,
      otRes,
      earnTypesRes,
      earnRes,
      earnGroupRes,
    ] = await Promise.all([
      ctx.supabase
        .from("employees")
        .select("id, full_name, status, join_date")
        .eq("company_id", ctx.companyId)
        .eq("id", employeeId)
        .maybeSingle(),
      ctx.supabase
        .from("compensation")
        .select(
          "employee_id, base_salary, pay_frequency, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from, work_days",
        )
        .eq("company_id", ctx.companyId)
        .eq("employee_id", employeeId),
      ctx.supabase
        .from("tax_profile")
        .select("ptkp_status, has_npwp")
        .eq("company_id", ctx.companyId)
        .eq("employee_id", employeeId)
        .maybeSingle(),
      ctx.supabase
        .from("company_settings")
        .select("jkk_risk_class, work_days")
        .eq("company_id", ctx.companyId)
        .maybeSingle(),
      ctx.supabase.from("bpjs_config").select("key, rate_bps, amount, effective_from, effective_to"),
      ctx.supabase
        .from("ter_rates")
        .select("category, income_lower, rate_bps, effective_from, effective_to"),
      ctx.supabase
        .from("overtime_entries")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("employee_id", employeeId)
        .eq("is_approved", true)
        .gte("date", period.start)
        .lte("date", period.end)
        .limit(1),
      ctx.supabase
        .from("custom_earning_types")
        .select("id, name, calc, amount, rate_bps, base, taxable, active")
        .eq("company_id", ctx.companyId),
      ctx.supabase
        .from("employee_earning")
        .select("custom_type_id, amount_override, enabled")
        .eq("company_id", ctx.companyId)
        .eq("employee_id", employeeId),
      ctx.supabase
        .from("employee_earning_group")
        .select("group_id")
        .eq("company_id", ctx.companyId)
        .eq("employee_id", employeeId)
        .maybeSingle(),
    ]);

    assertNoLoadErrors([
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
    ]);

    return {
      empRes,
      compRes,
      taxRes,
      settingsRes,
      bpjsRes,
      terRes,
      otRes,
      earnTypesRes,
      earnRes,
      earnGroupRes,
    };
  }

  const [
    empRes,
    compRes,
    taxRes,
    settingsRes,
    bpjsRes,
    terRes,
    otRes,
    earnTypesRes,
    earnRes,
    earnGroupRes,
  ] = await Promise.all([
    ctx.supabase
      .from("employees")
      .select("id, full_name, status, join_date")
      .eq("company_id", ctx.companyId)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    ctx.supabase
      .from("compensation")
      .select(
        "employee_id, base_salary, pay_frequency, fixed_allowances, bpjs_kes_enrolled, jht_enrolled, jp_enrolled, effective_from, work_days",
      )
      .eq("company_id", ctx.companyId),
    ctx.supabase
      .from("tax_profile")
      .select("employee_id, ptkp_status, has_npwp")
      .eq("company_id", ctx.companyId),
    ctx.supabase
      .from("company_settings")
      .select("jkk_risk_class, work_days")
      .eq("company_id", ctx.companyId)
      .maybeSingle(),
    ctx.supabase.from("bpjs_config").select("key, rate_bps, amount, effective_from, effective_to"),
    ctx.supabase
      .from("ter_rates")
      .select("category, income_lower, rate_bps, effective_from, effective_to"),
    ctx.supabase
      .from("overtime_entries")
      .select("employee_id")
      .eq("company_id", ctx.companyId)
      .eq("is_approved", true)
      .gte("date", period.start)
      .lte("date", period.end),
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

  assertNoLoadErrors([
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
  ]);

  return {
    empRes,
    compRes,
    taxRes,
    settingsRes,
    bpjsRes,
    terRes,
    otRes,
    earnTypesRes,
    earnRes,
    earnGroupRes,
  };
}
