"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  isStatutoryCode,
  newTables,
  resolveEmployeeDeductions,
  statutoryEnrollment,
} from "@/lib/deductions";

const updateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email().optional().or(z.literal("")),
  employeeNo: z.string().max(40).optional().or(z.literal("")),
  position: z.string().max(80).optional().or(z.literal("")),
  department: z.string().max(80).optional().or(z.literal("")),
  status: z.enum(["active", "probation", "inactive", "terminated"]),
  employmentType: z.enum(["permanent", "contract", "intern", "daily"]),
  baseSalary: z.coerce.number().int().min(0).default(0),
  // Daily rate for daily / mixed pay; the second box of the "mixed" salary model.
  dailyRate: z.coerce.number().int().min(0).default(0),
  // Per-employee working-days override (part-timers); blank = use the company figure.
  workingDaysOverride: z.coerce.number().int().min(0).max(31).optional().or(z.literal("")),
  paymentMethod: z.enum(["cash", "bank"]).default("cash"),
  payFrequency: z.enum(["monthly", "daily", "mixed"]).default("monthly"),
  ptkpStatus: z.enum(["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"]),
  npwp: z.string().max(30).optional().or(z.literal("")),
  managerId: z.string().uuid().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  bankName: z.string().max(80).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  accountName: z.string().max(120).optional().or(z.literal("")),
});

export type EditState = { error?: string; success?: string };

export async function updateEmployee(_prev: EditState, formData: FormData): Promise<EditState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }
  const d = parsed.data;

  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengubah karyawan." };
  }

  const { error: empErr } = await supabase
    .from("employees")
    .update({
      full_name: d.fullName,
      email: d.email || null,
      employee_no: d.employeeNo || null,
      position: d.position || null,
      department: d.department || null,
      status: d.status,
      employment_type: d.employmentType,
      phone: d.phone || null,
      // Self can't be its own manager; empty → no manager (unscopes from any team).
      manager_id: d.managerId && d.managerId !== d.id ? d.managerId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", d.id)
    .eq("company_id", active.id);

  if (empErr) {
    if (empErr.code === "23505") return { error: "Nomor karyawan sudah digunakan." };
    return { error: empErr.message };
  }

  // Upsert the primary bank account (admin write policy covers this).
  const { data: bank } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("employee_id", d.id)
    .eq("is_primary", true)
    .maybeSingle();

  const bankRow = {
    bank_name: d.bankName || null,
    account_no: d.accountNo || null,
    account_name: d.accountName || null,
  };
  if (bank) {
    await supabase.from("bank_accounts").update(bankRow).eq("id", bank.id);
  } else if (d.bankName || d.accountNo || d.accountName) {
    await supabase
      .from("bank_accounts")
      .insert({ ...bankRow, company_id: active.id, employee_id: d.id, is_primary: true });
  }

  // Upsert compensation (latest base salary).
  const { data: comp } = await supabase
    .from("compensation")
    .select("id")
    .eq("employee_id", d.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  // `daily_rate` and `working_days_override` are new columns not yet in the
  // generated types (TODO(db) — see docs/handoff/stage-07-salary-earnings.md), so
  // the compensation write is routed through the untyped cast used for the other
  // not-yet-migrated tables. The "mixed" pay_frequency value likewise needs the
  // check constraint widened before it persists.
  const workingDaysOverride =
    d.workingDaysOverride === "" || d.workingDaysOverride == null
      ? null
      : Number(d.workingDaysOverride);
  // For pure daily pay, `base_salary` mirrors the daily rate so the existing
  // worker (which reads daily-paid base_salary as the rate) keeps working until
  // it reads `daily_rate` directly. Monthly & mixed keep base_salary = monthly.
  const baseSalary = d.payFrequency === "daily" ? d.dailyRate : d.baseSalary;
  const compPayload = {
    base_salary: baseSalary,
    daily_rate: d.dailyRate,
    working_days_override: workingDaysOverride,
    payment_method: d.paymentMethod,
    pay_frequency: d.payFrequency,
  };
  const compDb = newTables(supabase);
  if (comp) {
    await compDb.from("compensation").update(compPayload).eq("id", comp.id);
  } else {
    await compDb.from("compensation").insert({
      company_id: active.id,
      employee_id: d.id,
      ...compPayload,
    });
  }

  // Upsert tax profile.
  await supabase.from("tax_profile").upsert(
    {
      employee_id: d.id,
      company_id: active.id,
      ptkp_status: d.ptkpStatus,
      npwp: d.npwp || null,
      has_npwp: Boolean(d.npwp),
    },
    { onConflict: "employee_id" },
  );

  revalidatePath(`/employees/${d.id}`);
  revalidatePath("/employees");
  return { success: "Perubahan disimpan." };
}

/**
 * Save which deductions apply to one employee: either assign them to a reusable
 * group template, or pick deductions manually. The resolved statutory set is then
 * mirrored onto the existing `compensation` enrollment booleans so the current
 * payroll worker honors the selection immediately.
 */
export async function updateEmployeeDeductions(
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Data tidak valid" };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengubah potongan gaji." };
  }

  const supabase = createClient();
  const db = newTables(supabase);
  const mode = formData.get("mode") === "group" ? "group" : "manual";

  if (mode === "group") {
    const groupId = String(formData.get("groupId") ?? "");
    if (!groupId) return { error: "Pilih grup potongan." };
    // Group assignment is the source of truth → clear any manual selections.
    await db.from("employee_deduction").delete().eq("company_id", active.id).eq("employee_id", employeeId);
    const { error } = await db
      .from("employee_deduction_group")
      .upsert({ company_id: active.id, employee_id: employeeId, group_id: groupId }, { onConflict: "employee_id" });
    if (error) return { error: error.message };
  } else {
    // Manual → clear any group assignment, then replace the per-employee rows.
    await db.from("employee_deduction_group").delete().eq("company_id", active.id).eq("employee_id", employeeId);
    await db.from("employee_deduction").delete().eq("company_id", active.id).eq("employee_id", employeeId);

    const statutory = formData.getAll("statutory").map(String).filter(isStatutoryCode);
    const customIds = formData.getAll("custom").map(String).filter(Boolean);
    const rows = [
      ...statutory.map((code) => ({
        company_id: active.id,
        employee_id: employeeId,
        statutory_code: code,
        custom_type_id: null,
        enabled: true,
      })),
      ...customIds.map((id) => ({
        company_id: active.id,
        employee_id: employeeId,
        statutory_code: null,
        custom_type_id: id,
        enabled: true,
      })),
    ];
    if (rows.length > 0) {
      const { error } = await db.from("employee_deduction").insert(rows);
      if (error) return { error: error.message };
    }
  }

  // Mirror the resolved statutory set onto the compensation enrollment booleans
  // the worker already reads, so the statutory half takes effect immediately.
  const resolved = await resolveEmployeeDeductions(supabase, active.id, employeeId);
  const enr = statutoryEnrollment(resolved);
  const { data: comp } = await supabase
    .from("compensation")
    .select("id")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (comp) {
    await supabase
      .from("compensation")
      .update({
        bpjs_kes_enrolled: enr.bpjs_kes_enrolled,
        bpjs_tk_enrolled: enr.jht_enrolled || enr.jp_enrolled,
        jht_enrolled: enr.jht_enrolled,
        jp_enrolled: enr.jp_enrolled,
        // TODO(db): also write pph21_enrolled once the column exists on
        // `compensation` — until then PPh 21 selection lives only in the
        // deduction config tables. — Antigravity
      })
      .eq("id", comp.id);
  }

  revalidatePath(`/employees/${employeeId}`);
  return { success: "Potongan gaji disimpan." };
}

/**
 * Save which earnings (allowances / tunjangan) apply to one employee: either
 * assign them to a reusable group template, or pick earnings manually with an
 * optional per-person fixed-amount override. Mirrors `updateEmployeeDeductions`.
 */
export async function updateEmployeeEarnings(
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Data tidak valid" };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengubah tunjangan." };
  }

  const supabase = createClient();
  const db = newTables(supabase);
  const mode = formData.get("mode") === "group" ? "group" : "manual";

  if (mode === "group") {
    const groupId = String(formData.get("groupId") ?? "");
    if (!groupId) return { error: "Pilih grup tunjangan." };
    // Group assignment is the source of truth → clear any manual selections.
    await db.from("employee_earning").delete().eq("company_id", active.id).eq("employee_id", employeeId);
    const { error } = await db
      .from("employee_earning_group")
      .upsert({ company_id: active.id, employee_id: employeeId, group_id: groupId }, { onConflict: "employee_id" });
    if (error) return { error: error.message };
  } else {
    // Manual → clear any group assignment, then replace the per-employee rows.
    await db.from("employee_earning_group").delete().eq("company_id", active.id).eq("employee_id", employeeId);
    await db.from("employee_earning").delete().eq("company_id", active.id).eq("employee_id", employeeId);

    const customIds = formData.getAll("custom").map(String).filter(Boolean);
    const rows = customIds.map((id) => {
      const raw = formData.get(`override:${id}`);
      const override = raw == null || String(raw).trim() === "" ? null : Number(raw);
      return {
        company_id: active.id,
        employee_id: employeeId,
        custom_type_id: id,
        amount_override: override != null && Number.isFinite(override) ? Math.round(override) : null,
        enabled: true,
      };
    });
    if (rows.length > 0) {
      const { error } = await db.from("employee_earning").insert(rows);
      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/employees/${employeeId}`);
  return { success: "Tunjangan disimpan." };
}
