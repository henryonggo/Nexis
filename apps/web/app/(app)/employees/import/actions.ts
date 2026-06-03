"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type ImportResult = {
  error?: string;
  created?: number;
  failures?: { line: number; name: string; reason: string }[];
  stoppedAtLimit?: boolean;
};

/** Minimal CSV line splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const HEADER_KEYS = ["full_name", "employee_no", "email", "position", "department", "base_salary"];

export async function importEmployees(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { error: "CSV kosong." };

  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengimpor karyawan." };
  }

  let lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Skip header row if it looks like one.
  if (lines.length > 0) {
    const first = splitCsvLine(lines[0]!).map((c) => c.toLowerCase());
    if (first.some((c) => HEADER_KEYS.includes(c))) lines = lines.slice(1);
  }

  const failures: NonNullable<ImportResult["failures"]> = [];
  let created = 0;
  let stoppedAtLimit = false;

  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const [fullName, employeeNo, email, position, department, baseSalaryRaw] = cols;
    const lineNo = i + 1;

    if (!fullName || fullName.length < 2) {
      failures.push({ line: lineNo, name: fullName ?? "(kosong)", reason: "Nama tidak valid" });
      continue;
    }
    const baseSalary = Number((baseSalaryRaw ?? "0").replace(/[^0-9]/g, "")) || 0;

    const { data: emp, error } = await supabase
      .from("employees")
      .insert({
        company_id: active.id,
        full_name: fullName,
        employee_no: employeeNo || null,
        email: email || null,
        position: position || null,
        department: department || null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.message.includes("FREE_SEAT_LIMIT_REACHED")) {
        stoppedAtLimit = true;
        failures.push({ line: lineNo, name: fullName, reason: "Batas kursi gratis tercapai" });
        break;
      }
      failures.push({
        line: lineNo,
        name: fullName,
        reason: error.code === "23505" ? "Nomor karyawan duplikat" : error.message,
      });
      continue;
    }

    if (emp) {
      await supabase
        .from("compensation")
        .insert({ company_id: active.id, employee_id: emp.id, base_salary: baseSalary });
      created++;
    }
  }

  revalidatePath("/employees");
  return { created, failures, stoppedAtLimit };
}
