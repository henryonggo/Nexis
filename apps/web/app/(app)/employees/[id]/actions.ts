"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

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
  ptkpStatus: z.enum(["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"]),
  npwp: z.string().max(30).optional().or(z.literal("")),
  managerId: z.string().uuid().optional().or(z.literal("")),
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

  // Upsert compensation (latest base salary).
  const { data: comp } = await supabase
    .from("compensation")
    .select("id")
    .eq("employee_id", d.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (comp) {
    await supabase.from("compensation").update({ base_salary: d.baseSalary }).eq("id", comp.id);
  } else {
    await supabase
      .from("compensation")
      .insert({ company_id: active.id, employee_id: d.id, base_salary: d.baseSalary });
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
