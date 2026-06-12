"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type ConfigState = { error?: string; success?: string };

/** Config is admin-level: owner/admin only (managers run oversight, not setup). */
async function requireAdmin() {
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." as string };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengatur kehadiran." as string };
  }
  return { active };
}

// ── Geofences ──────────────────────────────────────────────────────────────

const geofenceSchema = z.object({
  name: z.string().min(2, "Nama lokasi minimal 2 karakter").max(80),
  latitude: z.coerce.number().min(-90, "Lintang tidak valid").max(90, "Lintang tidak valid"),
  longitude: z.coerce.number().min(-180, "Bujur tidak valid").max(180, "Bujur tidak valid"),
  radiusMeters: z.coerce.number().int().min(10, "Radius minimal 10 meter").max(10000),
});

export async function createGeofence(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const parsed = geofenceSchema.safeParse({
    name: formData.get("name"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    radiusMeters: formData.get("radiusMeters"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };

  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = createClient();
  const { error } = await supabase.from("geofences").insert({
    company_id: gate.active!.id,
    name: parsed.data.name,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    radius_meters: parsed.data.radiusMeters,
  });
  if (error) return { error: error.message };

  revalidatePath("/attendance/config");
  return { success: "Lokasi geofence ditambahkan." };
}

export async function deleteGeofence(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "ID tidak valid" };

  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("geofences")
    .delete()
    .eq("id", id.data)
    .eq("company_id", gate.active!.id);
  if (error) return { error: error.message };

  revalidatePath("/attendance/config");
  return { success: "Lokasi geofence dihapus." };
}

// ── Shifts ─────────────────────────────────────────────────────────────────

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const shiftSchema = z.object({
  name: z.string().min(2, "Nama shift minimal 2 karakter").max(80),
  startTime: z.string().regex(timeRe, "Jam mulai tidak valid"),
  endTime: z.string().regex(timeRe, "Jam selesai tidak valid"),
  gracePeriodMinutes: z.coerce.number().int().min(0).max(240).default(0),
});

export async function createShift(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const parsed = shiftSchema.safeParse({
    name: formData.get("name"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    gracePeriodMinutes: formData.get("gracePeriodMinutes") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };

  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = createClient();
  const { error } = await supabase.from("shifts").insert({
    company_id: gate.active!.id,
    name: parsed.data.name,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    grace_period_minutes: parsed.data.gracePeriodMinutes,
  });
  if (error) return { error: error.message };

  revalidatePath("/attendance/config");
  return { success: "Shift ditambahkan." };
}

export async function deleteShift(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "ID tidak valid" };

  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("id", id.data)
    .eq("company_id", gate.active!.id);
  if (error) {
    // shift still referenced by a work_schedule
    if (error.code === "23503") return { error: "Shift masih dipakai jadwal kerja. Lepaskan dulu." };
    return { error: error.message };
  }

  revalidatePath("/attendance/config");
  return { success: "Shift dihapus." };
}

// ── Work schedules (per-employee weekly assignment) ──────────────────────────

const dayShift = z.union([z.string().uuid(), z.literal("")]);
const scheduleSchema = z.object({
  employeeId: z.string().uuid("Karyawan tidak valid"),
  // index = day_of_week (0=Sunday … 6=Saturday, Postgres dow convention)
  days: z.array(dayShift).length(7),
});

/**
 * Replace one employee's weekly schedule. Delete-then-insert avoids guessing the
 * table's unique-constraint target for an upsert; the whole week is one form.
 */
export async function saveSchedule(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const parsed = scheduleSchema.safeParse({
    employeeId: formData.get("employeeId"),
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => formData.get(`day_${d}`) ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };

  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = createClient();
  const companyId = gate.active!.id;

  const { error: delError } = await supabase
    .from("work_schedules")
    .delete()
    .eq("company_id", companyId)
    .eq("employee_id", parsed.data.employeeId);
  if (delError) return { error: delError.message };

  const rows = parsed.data.days
    .map((shiftId, day) => ({ day, shiftId }))
    .filter((r) => r.shiftId !== "")
    .map((r) => ({
      company_id: companyId,
      employee_id: parsed.data.employeeId,
      day_of_week: r.day,
      shift_id: r.shiftId,
    }));

  if (rows.length > 0) {
    const { error: insError } = await supabase.from("work_schedules").insert(rows);
    if (insError) return { error: insError.message };
  }

  revalidatePath("/attendance/config");
  return { success: "Jadwal kerja disimpan." };
}
