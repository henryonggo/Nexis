import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { ConfigTabs } from "./config-tabs";

export default async function AttendanceConfigPage() {
  const active = await getActiveCompany();
  if (!active) return null;
  // Config is admin-level; oversight roles bounce back to the live board.
  if (active.role !== "owner" && active.role !== "admin") redirect("/attendance");

  const supabase = createClient();
  const t = await getTranslations("attendance.config");
  const year = new Date().getFullYear();

  const [{ data: geofences }, { data: shifts }, { data: employees }, { data: scheduleRows }, { data: holidays }] =
    await Promise.all([
      supabase
        .from("geofences")
        .select("id, name, latitude, longitude, radius_meters")
        .eq("company_id", active.id)
        .order("name"),
      supabase
        .from("shifts")
        .select("id, name, start_time, end_time, grace_period_minutes")
        .eq("company_id", active.id)
        .order("start_time"),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("company_id", active.id)
        .order("full_name"),
      supabase
        .from("work_schedules")
        .select("employee_id, day_of_week, shift_id")
        .eq("company_id", active.id),
      supabase
        .from("holidays")
        .select("id, date, name, is_national")
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`)
        .order("date"),
    ]);

  const schedules: Record<string, Record<number, string>> = {};
  for (const row of (scheduleRows as { employee_id: string; day_of_week: number; shift_id: string | null }[] | null) ?? []) {
    if (!row.shift_id) continue;
    (schedules[row.employee_id] ??= {})[row.day_of_week] = row.shift_id;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/attendance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <ConfigTabs
        geofences={geofences ?? []}
        shifts={shifts ?? []}
        employees={employees ?? []}
        schedules={schedules}
        holidays={holidays ?? []}
        year={year}
      />
    </div>
  );
}
