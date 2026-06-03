import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import type { Database } from "@nexis/types";
import { LiveBoard, type AttendanceRecord } from "./live-board";

/** Start of "today" in Asia/Jakarta (WIB, UTC+7, no DST), as a UTC ISO string. */
function startOfTodayJakartaIso(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startWibUtcMs = Date.UTC(
    nowWib.getUTCFullYear(),
    nowWib.getUTCMonth(),
    nowWib.getUTCDate(),
  );
  return new Date(startWibUtcMs - WIB_OFFSET_MS).toISOString();
}

type RecordRow = Pick<
  Database["public"]["Tables"]["attendance_records"]["Row"],
  "id" | "employee_id" | "kind" | "event_at" | "is_valid" | "latitude" | "longitude" | "note" | "selfie_url"
>;

export default async function AttendancePage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const canCorrect = active.role !== "employee";
  const since = startOfTodayJakartaIso();

  const [{ data: employees }, { data: records }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", active.id),
    supabase
      .from("attendance_records")
      .select("id, employee_id, kind, event_at, is_valid, latitude, longitude, note, selfie_url")
      .eq("company_id", active.id)
      .gte("event_at", since)
      .order("event_at", { ascending: false }),
  ]);

  const nameById: Record<string, string> = {};
  for (const e of (employees as { id: string; full_name: string }[] | null) ?? []) {
    nameById[e.id] = e.full_name;
  }

  const initial = ((records as RecordRow[] | null) ?? []) as AttendanceRecord[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Kehadiran</h1>
        <p className="text-sm text-muted">
          Status langsung kehadiran karyawan {active.name} hari ini.
        </p>
      </div>

      <LiveBoard
        companyId={active.id}
        nameById={nameById}
        initialRecords={initial}
        canCorrect={canCorrect}
      />
    </div>
  );
}
