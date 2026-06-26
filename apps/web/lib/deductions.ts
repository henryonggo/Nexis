import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";

/**
 * Configurable salary deductions — admin/owner choose what reduces an
 * employee/manager's pay. Nothing is applied by default: an employee with no
 * group assignment and no manual selections has an empty deduction set.
 *
 * Two ways to apply deductions:
 *  - assign the employee to a reusable group template (members follow the group), or
 *  - pick deductions manually, one by one, per employee.
 *
 * Deductions are either STATUTORY (BPJS Kesehatan, JHT, JP, PPh 21 — computed by
 * the payroll engine) or CUSTOM (admin-defined fixed-rupiah or percentage).
 */

export type StatutoryCode = "bpjs_kes" | "jht" | "jp" | "pph21";
export type DeductionCalc = "fixed" | "percent";
export type DeductionBase = "gross" | "base_salary";

/** Statutory deductions, in display order. All are legally mandatory in Indonesia. */
export const STATUTORY_DEDUCTIONS: {
  code: StatutoryCode;
  /** Key under the `deductions.statutory.*` i18n namespace. */
  labelKey: string;
}[] = [
  { code: "bpjs_kes", labelKey: "bpjsKes" },
  { code: "jht", labelKey: "jht" },
  { code: "jp", labelKey: "jp" },
  { code: "pph21", labelKey: "pph21" },
];

const STATUTORY_CODES = new Set<StatutoryCode>(STATUTORY_DEDUCTIONS.map((d) => d.code));

export function isStatutoryCode(value: string): value is StatutoryCode {
  return STATUTORY_CODES.has(value as StatutoryCode);
}

export interface CustomDeductionType {
  id: string;
  name: string;
  calc: DeductionCalc;
  /** Whole rupiah, set when calc === "fixed". */
  amount: number | null;
  /** Basis points (100 = 1%), set when calc === "percent". */
  rateBps: number | null;
  /** What the percentage applies to, set when calc === "percent". */
  base: DeductionBase | null;
  active: boolean;
}

export interface DeductionGroup {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  statutory: StatutoryCode[];
  customTypeIds: string[];
}

/** A single resolved deduction that applies to an employee. */
export interface EffectiveDeduction {
  /** Stable key: a statutory code, or `custom:<uuid>`. */
  key: string;
  kind: "statutory" | "custom";
  statutoryCode: StatutoryCode | null;
  custom: CustomDeductionType | null;
}

export interface ResolvedDeductions {
  /** Where the set came from. "none" → nothing applied (the default). */
  source: "group" | "manual" | "none";
  groupId: string | null;
  items: EffectiveDeduction[];
}

/** The four statutory enrollment booleans, mirrored onto `compensation`. */
export interface StatutoryEnrollment {
  bpjs_kes_enrolled: boolean;
  jht_enrolled: boolean;
  jp_enrolled: boolean;
  pph21_enrolled: boolean;
}

/** All custom deduction types for the company, active first then by name. */
export async function listCustomDeductions(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<CustomDeductionType[]> {
  const { data } = await supabase
    .from("custom_deduction_types")
    .select("id, name, calc, amount, rate_bps, base, active")
    .eq("company_id", companyId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  return ((data as any[] | null) ?? []).map(toCustom);
}

function toCustom(row: any): CustomDeductionType {
  return {
    id: row.id,
    name: row.name,
    calc: row.calc,
    amount: row.amount ?? null,
    rateBps: row.rate_bps ?? null,
    base: row.base ?? null,
    active: row.active ?? true,
  };
}

/** All deduction groups for the company, with their statutory + custom items. */
export async function listDeductionGroups(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<DeductionGroup[]> {
  const { data: groups } = await supabase
    .from("deduction_groups")
    .select("id, name, description, active")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  const list = (groups as any[] | null) ?? [];
  if (list.length === 0) return [];

  const { data: items } = await supabase
    .from("deduction_group_items")
    .select("group_id, statutory_code, custom_type_id")
    .eq("company_id", companyId);

  const byGroup = new Map<string, { statutory: StatutoryCode[]; customTypeIds: string[] }>();
  for (const it of (items as any[] | null) ?? []) {
    const bucket = byGroup.get(it.group_id) ?? { statutory: [], customTypeIds: [] };
    if (it.statutory_code && isStatutoryCode(it.statutory_code)) bucket.statutory.push(it.statutory_code);
    else if (it.custom_type_id) bucket.customTypeIds.push(it.custom_type_id);
    byGroup.set(it.group_id, bucket);
  }

  return list.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    active: g.active ?? true,
    statutory: byGroup.get(g.id)?.statutory ?? [],
    customTypeIds: byGroup.get(g.id)?.customTypeIds ?? [],
  }));
}

/**
 * The effective deduction set for one employee. Resolution rule (single source
 * of truth): the items of the assigned group if the employee is in a group,
 * otherwise their manual `employee_deduction` rows; if neither, an empty set.
 */
export async function resolveEmployeeDeductions(
  supabase: SupabaseClient<Database>,
  companyId: string,
  employeeId: string,
): Promise<ResolvedDeductions> {
  const customs = await listCustomDeductions(supabase, companyId);
  const customById = new Map(customs.map((c) => [c.id, c]));

  // Group assignment wins when present.
  const { data: assignment } = await supabase
    .from("employee_deduction_group")
    .select("group_id")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (assignment?.group_id) {
    const groups = await listDeductionGroups(supabase, companyId);
    const group = groups.find((g) => g.id === assignment.group_id);
    if (group) {
      return {
        source: "group",
        groupId: group.id,
        items: buildItems(group.statutory, group.customTypeIds, customById),
      };
    }
  }

  // Otherwise, manual per-employee selections.
  const { data: manual } = await supabase
    .from("employee_deduction")
    .select("statutory_code, custom_type_id, enabled")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId);

  const rows = ((manual as any[] | null) ?? []).filter((r) => r.enabled);
  if (rows.length === 0) return { source: "none", groupId: null, items: [] };

  const statutory: StatutoryCode[] = [];
  const customIds: string[] = [];
  for (const r of rows) {
    if (r.statutory_code && isStatutoryCode(r.statutory_code)) statutory.push(r.statutory_code);
    else if (r.custom_type_id) customIds.push(r.custom_type_id);
  }

  return {
    source: "manual",
    groupId: null,
    items: buildItems(statutory, customIds, customById),
  };
}

function buildItems(
  statutory: StatutoryCode[],
  customTypeIds: string[],
  customById: Map<string, CustomDeductionType>,
): EffectiveDeduction[] {
  const items: EffectiveDeduction[] = [];
  for (const { code } of STATUTORY_DEDUCTIONS) {
    if (statutory.includes(code)) {
      items.push({ key: code, kind: "statutory", statutoryCode: code, custom: null });
    }
  }
  for (const id of customTypeIds) {
    const custom = customById.get(id);
    if (custom) items.push({ key: `custom:${id}`, kind: "custom", statutoryCode: null, custom });
  }
  return items;
}

/**
 * Mandatory statutory deductions that are NOT in the resolved set. Drives the
 * non-blocking compliance warning (BPJS/PPh 21 are legally required in Indonesia).
 */
export function statutoryComplianceWarnings(resolved: ResolvedDeductions): StatutoryCode[] {
  const present = new Set(resolved.items.filter((i) => i.statutoryCode).map((i) => i.statutoryCode!));
  return STATUTORY_DEDUCTIONS.map((d) => d.code).filter((code) => !present.has(code));
}

/** Map a resolved set onto the `compensation` enrollment booleans the worker reads. */
export function statutoryEnrollment(resolved: ResolvedDeductions): StatutoryEnrollment {
  const present = new Set(resolved.items.filter((i) => i.statutoryCode).map((i) => i.statutoryCode!));
  return {
    bpjs_kes_enrolled: present.has("bpjs_kes"),
    jht_enrolled: present.has("jht"),
    jp_enrolled: present.has("jp"),
    pph21_enrolled: present.has("pph21"),
  };
}
