"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

const employeeSchema = z.object({
  fullName: z.string().min(2, "Nama karyawan minimal 2 karakter"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  employeeNo: z.string().max(40).optional().or(z.literal("")),
  position: z.string().max(80).optional().or(z.literal("")),
  department: z.string().max(80).optional().or(z.literal("")),
  baseSalary: z.coerce.number().int().min(0).default(0),
  employmentType: z.enum(["permanent", "contract", "intern", "daily"]).default("permanent"),
});

export type EmployeeState = { error?: string; success?: string; upgrade?: boolean };

export async function createEmployee(
  _prev: EmployeeState,
  formData: FormData,
): Promise<EmployeeState> {
  const parsed = employeeSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? "",
    employeeNo: formData.get("employeeNo") ?? "",
    position: formData.get("position") ?? "",
    department: formData.get("department") ?? "",
    baseSalary: formData.get("baseSalary") ?? 0,
    employmentType: formData.get("employmentType") ?? "permanent",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat menambah karyawan." };
  }

  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      company_id: active.id,
      full_name: parsed.data.fullName,
      email: parsed.data.email || null,
      employee_no: parsed.data.employeeNo || null,
      position: parsed.data.position || null,
      department: parsed.data.department || null,
      employment_type: parsed.data.employmentType,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("FREE_SEAT_LIMIT_REACHED")) {
      return {
        error:
          "Batas paket gratis tercapai (5 karyawan). Upgrade untuk menambah karyawan lagi.",
        upgrade: true,
      };
    }
    if (error.code === "23505") {
      return { error: "Nomor karyawan sudah digunakan." };
    }
    return { error: error.message };
  }

  // Seed a compensation row so payroll (Stage 4) has a base salary to work with.
  if (employee) {
    await supabase.from("compensation").insert({
      company_id: active.id,
      employee_id: employee.id,
      base_salary: parsed.data.baseSalary,
    });
  }

  revalidatePath("/employees");
  return { success: "Karyawan ditambahkan." };
}
