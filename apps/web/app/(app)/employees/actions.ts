"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { getNextEmployeeNumber } from "@/lib/employees";

const employeeSchema = z.object({
  fullName: z.string().min(2, "Nama karyawan minimal 2 karakter"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  employeeNo: z.string().max(40).optional().or(z.literal("")),
  position: z.string().max(80).optional().or(z.literal("")),
  department: z.string().max(80).optional().or(z.literal("")),
  baseSalary: z.coerce.number().int().min(0).default(0),
  dailyRate: z.coerce.number().int().min(0).default(0),
  employmentType: z.enum(["permanent", "contract", "intern", "daily"]).default("permanent"),
  phone: z.string().max(30).optional().or(z.literal("")),
  bankName: z.string().max(80).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  accountName: z.string().max(120).optional().or(z.literal("")),
  payFrequency: z.enum(["monthly", "daily", "mixed"]).default("monthly"),
  ptkpStatus: z.string().default("TK/0"),
  npwp: z.string().max(20).optional().or(z.literal("")),
  ktp: z.string().regex(/^\d{16}$/, "KTP harus 16 digit").optional().or(z.literal("")),
  customSchedule: z.string().optional().or(z.literal("")),
  workDays: z.array(z.coerce.number()).optional(),
  dailyCalcMode: z.string().optional().or(z.literal("")),
});

export type EmployeeState = { error?: string; success?: string; upgrade?: boolean };

export async function createEmployee(
  _prev: EmployeeState,
  formData: FormData,
): Promise<EmployeeState> {
  const workDaysRaw = formData.getAll("workDays");
  const parsed = employeeSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? "",
    employeeNo: formData.get("employeeNo") ?? "",
    position: formData.get("position") ?? "",
    department: formData.get("department") ?? "",
    baseSalary: formData.get("baseSalary") ?? 0,
    dailyRate: formData.get("dailyRate") ?? 0,
    employmentType: formData.get("employmentType") ?? "permanent",
    phone: formData.get("phone") ?? "",
    bankName: formData.get("bankName") ?? "",
    accountNo: formData.get("accountNo") ?? "",
    accountName: formData.get("accountName") ?? "",
    payFrequency: formData.get("payFrequency") ?? "monthly",
    ptkpStatus: formData.get("ptkpStatus") ?? "TK/0",
    npwp: formData.get("npwp") ?? "",
    ktp: formData.get("ktp") ?? "",
    customSchedule: formData.get("customSchedule") ?? "",
    workDays: workDaysRaw.length > 0 ? workDaysRaw.map(Number) : undefined,
    dailyCalcMode: formData.get("dailyCalcMode") ?? "",
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

  // Determine the employee number: use provided value or auto-compute fallback
  let employeeNo = parsed.data.employeeNo || null;

  const attemptInsert = async (empNo: string | null) => {
    return supabase
      .from("employees")
      .insert({
        company_id: active.id,
        full_name: parsed.data.fullName,
        email: parsed.data.email || null,
        employee_no: empNo,
        position: parsed.data.position || null,
        department: parsed.data.department || null,
        employment_type: parsed.data.employmentType,
        phone: parsed.data.phone || null,
      })
      .select("id")
      .single();
  };

  let result = await attemptInsert(employeeNo);

  // If no employee number was provided and we hit a unique constraint,
  // compute the next number and retry once
  if (!employeeNo && result.error?.code === "23505") {
    const nextNo = await getNextEmployeeNumber(active.id);
    result = await attemptInsert(String(nextNo));
  }

  const { data: employee, error } = result;

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
    const dailyCalcModeValue = parsed.data.dailyCalcMode === "manual" ? "manual" : "attendance";
    const workDaysValue = parsed.data.customSchedule && parsed.data.workDays ? parsed.data.workDays : null;

    await supabase.from("compensation").insert({
      company_id: active.id,
      employee_id: employee.id,
      base_salary: parsed.data.baseSalary,
      daily_rate: parsed.data.dailyRate,
      pay_frequency: parsed.data.payFrequency,
      work_days: workDaysValue,
      daily_calc_mode: dailyCalcModeValue,
    });

    // Seed a tax_profile row if either NPWP or KTP is provided.
    if (parsed.data.npwp || parsed.data.ktp) {
      await supabase.from("tax_profile").insert({
        company_id: active.id,
        employee_id: employee.id,
        has_npwp: !!parsed.data.npwp,
        npwp: parsed.data.npwp || null,
        ktp: parsed.data.ktp || null,
        ptkp_status: parsed.data.ptkpStatus,
      });
    }

    // Seed the primary bank account when any bank field was provided at registration.
    if (parsed.data.bankName || parsed.data.accountNo || parsed.data.accountName) {
      await supabase.from("bank_accounts").insert({
        company_id: active.id,
        employee_id: employee.id,
        bank_name: parsed.data.bankName || null,
        account_no: parsed.data.accountNo || null,
        account_name: parsed.data.accountName || null,
        is_primary: true,
      });
    }
  }

  revalidatePath("/employees");
  return { success: "Karyawan ditambahkan." };
}
