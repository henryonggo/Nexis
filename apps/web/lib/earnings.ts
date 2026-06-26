import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";
import { percentBps, sum, type Rupiah } from "@nexis/money";

/**
 * Configurable salary earnings (allowances / tunjangan) — the mirror of
 * `lib/deductions.ts` for the income side of a payslip. Admin/owner break a
 * salary into named components beyond base pay: gaji pokok is the employee's
 * base salary, and everything else (tunjangan makan, tunjangan kendaraan,
 * kompensasi PKWT, …) is a configurable earning here.
 *
 * Two ways to apply earnings, same model as deductions:
 *  - assign the employee to a reusable group template ("tunjangan group" — a set
 *    applied to a whole class of employees), or
 *  - pick earnings manually per employee, optionally overriding the amount for
 *    that one person (the spec's "adjusted per employee").
 *
 * Earnings are admin-defined: a fixed rupiah amount, or a percentage of gross /
 * base salary. `taxable` records whether the component is part of taxable gross
 * (most allowances are; some reimbursive ones are not) — the payroll engine
 * consumes this when it lands.
 */

export type EarningCalc = "fixed" | "percent";
export type EarningBase = "gross" | "base_salary";

export interface CustomEarningType {
  id: string;
  name: string;
  calc: EarningCalc;
  /** Whole rupiah, set when calc === "fixed". */
  amount: number | null;
  /** Basis points (100 = 1%), set when calc === "percent". */
  rateBps: number | null;
  /** What the percentage applies to, set when calc === "percent". */
  base: EarningBase | null;
  /** Whether the component counts toward taxable gross. */
  taxable: boolean;
  active: boolean;
}

export interface EarningGroup {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  customTypeIds: string[];
}

/** A single resolved earning that applies to an employee. */
export interface EffectiveEarning {
  /** Stable key: `earning:<uuid>`. */
  key: string;
  type: CustomEarningType;
  /** Per-employee fixed-amount override (manual mode only); null = use the type's amount. */
  amountOverride: number | null;
}

export interface ResolvedEarnings {
  /** Where the set came from. "none" → nothing applied (the default). */
  source: "group" | "manual" | "none";
  groupId: string | null;
  items: EffectiveEarning[];
}

/** One computed earning line for a payslip breakdown. */
export interface EarningLine {
  typeId: string;
  label: string;
  amount: Rupiah;
  taxable: boolean;
}

/** All custom earning types for the company, active first then by name. */
export async function listCustomEarnings(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<CustomEarningType[]> {
  const { data } = await supabase
    .from("custom_earning_types")
    .select("id, name, calc, amount, rate_bps, base, taxable, active")
    .eq("company_id", companyId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  return ((data as any[] | null) ?? []).map(toCustom);
}

function toCustom(row: any): CustomEarningType {
  return {
    id: row.id,
    name: row.name,
    calc: row.calc,
    amount: row.amount ?? null,
    rateBps: row.rate_bps ?? null,
    base: row.base ?? null,
    taxable: row.taxable ?? true,
    active: row.active ?? true,
  };
}

/** All earning groups for the company, with their custom items. */
export async function listEarningGroups(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<EarningGroup[]> {
  const { data: groups } = await supabase
    .from("earning_groups")
    .select("id, name, description, active")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  const list = (groups as any[] | null) ?? [];
  if (list.length === 0) return [];

  const { data: items } = await supabase
    .from("earning_group_items")
    .select("group_id, custom_type_id")
    .eq("company_id", companyId);

  const byGroup = new Map<string, string[]>();
  for (const it of (items as any[] | null) ?? []) {
    if (!it.custom_type_id) continue;
    const bucket = byGroup.get(it.group_id) ?? [];
    bucket.push(it.custom_type_id);
    byGroup.set(it.group_id, bucket);
  }

  return list.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    active: g.active ?? true,
    customTypeIds: byGroup.get(g.id) ?? [],
  }));
}

/**
 * The effective earning set for one employee. Resolution rule (single source of
 * truth, identical to deductions): the items of the assigned group if the
 * employee is in a group, otherwise their manual `employee_earning` rows; if
 * neither, an empty set. Group membership ignores per-person overrides (a group
 * is a shared template); manual rows may carry an `amount_override`.
 */
export async function resolveEmployeeEarnings(
  supabase: SupabaseClient<Database>,
  companyId: string,
  employeeId: string,
): Promise<ResolvedEarnings> {
  const customs = await listCustomEarnings(supabase, companyId);
  const customById = new Map(customs.map((c) => [c.id, c]));

  // Group assignment wins when present.
  const { data: assignment } = await supabase
    .from("employee_earning_group")
    .select("group_id")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (assignment?.group_id) {
    const groups = await listEarningGroups(supabase, companyId);
    const group = groups.find((g) => g.id === assignment.group_id);
    if (group) {
      const items: EffectiveEarning[] = [];
      for (const id of group.customTypeIds) {
        const type = customById.get(id);
        if (type) items.push({ key: `earning:${id}`, type, amountOverride: null });
      }
      return { source: "group", groupId: group.id, items };
    }
  }

  // Otherwise, manual per-employee selections (with optional amount override).
  const { data: manual } = await supabase
    .from("employee_earning")
    .select("custom_type_id, amount_override, enabled")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId);

  const rows = ((manual as any[] | null) ?? []).filter((r) => r.enabled && r.custom_type_id);
  if (rows.length === 0) return { source: "none", groupId: null, items: [] };

  const items: EffectiveEarning[] = [];
  for (const r of rows) {
    const type = customById.get(r.custom_type_id);
    if (type) {
      items.push({
        key: `earning:${r.custom_type_id}`,
        type,
        amountOverride: r.amount_override ?? null,
      });
    }
  }
  return { source: "manual", groupId: null, items };
}

/**
 * Resolve each earning to whole rupiah for a payslip breakdown. `gross` and
 * `baseSalary` are the bases a percentage earning applies to. A fixed earning
 * uses its per-employee override when present, else the type's amount.
 */
export function computeEarningLines(
  resolved: ResolvedEarnings,
  bases: { gross: Rupiah; baseSalary: Rupiah },
): EarningLine[] {
  return resolved.items.map((item) => {
    const t = item.type;
    let amount: Rupiah;
    if (t.calc === "fixed") {
      amount = item.amountOverride ?? t.amount ?? 0;
    } else {
      const base = t.base === "base_salary" ? bases.baseSalary : bases.gross;
      amount = percentBps(base, t.rateBps ?? 0);
    }
    return { typeId: t.id, label: t.name, amount, taxable: t.taxable };
  });
}

/** Total of the taxable earning lines (the part that flows into taxable gross). */
export function sumTaxableEarnings(lines: EarningLine[]): Rupiah {
  return sum(...lines.filter((l) => l.taxable).map((l) => l.amount));
}

/** Total of every earning line (taxable + non-taxable), for take-home display. */
export function sumAllEarnings(lines: EarningLine[]): Rupiah {
  return sum(...lines.map((l) => l.amount));
}

// ───────────────────────────────────────────────────────────────────────────
// Bulk resolution — load the whole company's earning config once, then resolve
// per employee in memory. The run preview iterates every employee, so the
// per-employee `resolveEmployeeEarnings` (one query each) would be N+1; this
// reads the four tables in parallel and applies the same resolution rule.
// ───────────────────────────────────────────────────────────────────────────

export interface BulkEarnings {
  customById: Map<string, CustomEarningType>;
  groupItemIds: Map<string, string[]>;
  assignment: Map<string, string>;
  manual: Map<string, { customTypeId: string; amountOverride: number | null }[]>;
}

export async function loadBulkEarnings(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<BulkEarnings> {
  const db = supabase;
  const [{ data: types }, { data: items }, { data: groups }, { data: manual }] = await Promise.all([
    db.from("custom_earning_types").select("id, name, calc, amount, rate_bps, base, taxable, active").eq("company_id", companyId),
    db.from("earning_group_items").select("group_id, custom_type_id").eq("company_id", companyId),
    db.from("employee_earning_group").select("employee_id, group_id").eq("company_id", companyId),
    db.from("employee_earning").select("employee_id, custom_type_id, amount_override, enabled").eq("company_id", companyId),
  ]);

  const customById = new Map<string, CustomEarningType>(
    ((types as any[] | null) ?? []).map((r) => [r.id, toCustom(r)]),
  );
  const groupItemIds = new Map<string, string[]>();
  for (const it of (items as any[] | null) ?? []) {
    if (!it.custom_type_id) continue;
    const bucket = groupItemIds.get(it.group_id) ?? [];
    bucket.push(it.custom_type_id);
    groupItemIds.set(it.group_id, bucket);
  }
  const assignment = new Map<string, string>();
  for (const a of (groups as any[] | null) ?? []) {
    if (a.employee_id && a.group_id) assignment.set(a.employee_id, a.group_id);
  }
  const manualByEmp = new Map<string, { customTypeId: string; amountOverride: number | null }[]>();
  for (const m of (manual as any[] | null) ?? []) {
    if (!m.enabled || !m.custom_type_id) continue;
    const bucket = manualByEmp.get(m.employee_id) ?? [];
    bucket.push({ customTypeId: m.custom_type_id, amountOverride: m.amount_override ?? null });
    manualByEmp.set(m.employee_id, bucket);
  }

  return { customById, groupItemIds, assignment, manual: manualByEmp };
}

/** Resolve one employee's earnings from a pre-loaded bulk set (group wins, else manual). */
export function resolveFromBulk(bulk: BulkEarnings, employeeId: string): ResolvedEarnings {
  const groupId = bulk.assignment.get(employeeId);
  if (groupId) {
    const items: EffectiveEarning[] = [];
    for (const id of bulk.groupItemIds.get(groupId) ?? []) {
      const type = bulk.customById.get(id);
      if (type?.active) items.push({ key: `earning:${id}`, type, amountOverride: null });
    }
    return { source: "group", groupId, items };
  }

  const rows = bulk.manual.get(employeeId) ?? [];
  if (rows.length === 0) return { source: "none", groupId: null, items: [] };
  const items: EffectiveEarning[] = [];
  for (const r of rows) {
    const type = bulk.customById.get(r.customTypeId);
    if (type?.active) {
      items.push({ key: `earning:${r.customTypeId}`, type, amountOverride: r.amountOverride });
    }
  }
  return { source: "manual", groupId: null, items };
}
