"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/roles";

export type EarningState = { error?: string; ok?: boolean };

/** Resolve the active company and assert owner/admin. Returns null when blocked. */
async function requireManager(): Promise<{ id: string } | null> {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (!isAdminRole(active.role)) return null;
  return { id: active.id };
}

const NOT_ALLOWED = "Hanya pemilik/admin yang dapat mengubah tunjangan.";

// — Custom earning types ———————————————————————————————————————————————————

const customSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
    calc: z.enum(["fixed", "percent"]),
    // Whole rupiah for a fixed earning.
    amount: z.coerce.number().int().min(0).default(0),
    // Percentage (e.g. 2.5) for a percentage earning; stored as basis points.
    ratePercent: z.coerce.number().min(0).max(100).default(0),
    base: z.enum(["gross", "base_salary"]).default("base_salary"),
    taxable: z.coerce.boolean().default(true),
  })
  .refine((d) => (d.calc === "fixed" ? d.amount > 0 : d.ratePercent > 0), {
    message: "Masukkan nominal atau persentase tunjangan.",
  });

/** Build the row from validated input. Only the relevant calc fields are set. */
function customRow(d: z.infer<typeof customSchema>, companyId: string) {
  const fixed = d.calc === "fixed";
  return {
    company_id: companyId,
    name: d.name,
    calc: d.calc,
    amount: fixed ? d.amount : null,
    rate_bps: fixed ? null : Math.round(d.ratePercent * 100),
    base: fixed ? null : d.base,
    taxable: d.taxable,
  };
}

/** Checkboxes submit "on" / absent — normalise to a boolean before validation. */
function withTaxable(formData: FormData): Record<string, unknown> {
  return { ...Object.fromEntries(formData), taxable: formData.get("taxable") === "on" };
}

export async function createCustomEarning(
  _prev: EarningState,
  formData: FormData,
): Promise<EarningState> {
  const active = await requireManager();
  if (!active) return { error: NOT_ALLOWED };

  const parsed = customSchema.safeParse(withTaxable(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const supabase = createClient();
  const { error } = await supabase
    .from("custom_earning_types")
    .insert({ ...customRow(parsed.data, active.id), active: true });
  if (error) return { error: error.message };

  revalidatePath("/earnings");
  return { ok: true };
}

export async function updateCustomEarning(
  _prev: EarningState,
  formData: FormData,
): Promise<EarningState> {
  const active = await requireManager();
  if (!active) return { error: NOT_ALLOWED };

  const parsed = customSchema.safeParse(withTaxable(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  if (!parsed.data.id) return { error: "Tunjangan tidak ditemukan." };

  const supabase = createClient();
  const { error } = await supabase
    .from("custom_earning_types")
    .update(customRow(parsed.data, active.id))
    .eq("id", parsed.data.id)
    .eq("company_id", active.id);
  if (error) return { error: error.message };

  revalidatePath("/earnings");
  return { ok: true };
}

export async function deleteCustomEarning(formData: FormData): Promise<void> {
  const active = await requireManager();
  if (!active) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createClient();
  // Soft-delete: keep history intact, drop it from selection lists.
  await supabase
    .from("custom_earning_types")
    .update({ active: false })
    .eq("id", id)
    .eq("company_id", active.id);

  revalidatePath("/earnings");
}

// — Groups ————————————————————————————————————————————————————————————————

const groupSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Nama grup minimal 2 karakter").max(80),
  description: z.string().trim().max(200).optional().or(z.literal("")),
});

/** Replace a group's items from the submitted custom type ids. */
async function writeGroupItems(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  groupId: string,
  customIds: string[],
): Promise<string | null> {
  const db = supabase;
  const { error: delErr } = await db
    .from("earning_group_items")
    .delete()
    .eq("group_id", groupId)
    .eq("company_id", companyId);
  if (delErr) return delErr.message;

  const rows = customIds.map((id) => ({
    company_id: companyId,
    group_id: groupId,
    custom_type_id: id,
  }));
  if (rows.length === 0) return null;

  const { error: insErr } = await db.from("earning_group_items").insert(rows);
  return insErr ? insErr.message : null;
}

export async function createEarningGroup(
  _prev: EarningState,
  formData: FormData,
): Promise<EarningState> {
  const active = await requireManager();
  if (!active) return { error: NOT_ALLOWED };

  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("earning_groups")
    .insert({
      company_id: active.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      active: true,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const itemsErr = await writeGroupItems(
    supabase,
    active.id,
    data.id,
    formData.getAll("custom").map(String),
  );
  if (itemsErr) return { error: itemsErr };

  revalidatePath("/earnings");
  return { ok: true };
}

export async function updateEarningGroup(
  _prev: EarningState,
  formData: FormData,
): Promise<EarningState> {
  const active = await requireManager();
  if (!active) return { error: NOT_ALLOWED };

  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  if (!parsed.data.id) return { error: "Grup tidak ditemukan." };

  const supabase = createClient();
  const { error } = await supabase
    .from("earning_groups")
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq("id", parsed.data.id)
    .eq("company_id", active.id);
  if (error) return { error: error.message };

  const itemsErr = await writeGroupItems(
    supabase,
    active.id,
    parsed.data.id,
    formData.getAll("custom").map(String),
  );
  if (itemsErr) return { error: itemsErr };

  revalidatePath("/earnings");
  // Group edits flow to members → refresh any employee pages reading the group.
  revalidatePath("/employees", "layout");
  return { ok: true };
}

export async function deleteEarningGroup(formData: FormData): Promise<void> {
  const active = await requireManager();
  if (!active) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createClient();
  const db = supabase;
  await db.from("earning_group_items").delete().eq("group_id", id).eq("company_id", active.id);
  await db.from("employee_earning_group").delete().eq("group_id", id).eq("company_id", active.id);
  await db.from("earning_groups").delete().eq("id", id).eq("company_id", active.id);

  revalidatePath("/earnings");
  revalidatePath("/employees", "layout");
}
