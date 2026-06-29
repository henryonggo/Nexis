import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { guardEmployeeAccess } from "@/lib/access";
import type { Database } from "@nexis/types";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { IconButton } from "@/components/ui/icon-button";
import { LiveBoard, type AttendanceRecord } from "./live-board";
import { OvertimeQueue, type PendingOvertime } from "./overtime-queue";
import { ClockInOut } from "./clock-in-out";

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
  "id" | "employee_id" | "kind" | "event_at" | "is_valid" | "latitude" | "longitude" | "note" | "selfie_url" | "liveness_passed"
>;

export default async function AttendancePage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;
  await guardEmployeeAccess(active.role, active.id, "attendance");

  const canCorrect = active.role !== "employee";
  const canConfigure = active.role === "owner" || active.role === "admin";
  // Overtime writes allow owner/admin/manager (user_is_company_manager_or_admin RLS).
  const canApproveOvertime = canCorrect;
  const since = startOfTodayJakartaIso();
  const t = await getTranslations("attendance");

  const [{ data: employees }, { data: records }, { data: pendingOvertime }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", active.id),
    supabase
      .from("attendance_records")
      .select("id, employee_id, kind, event_at, is_valid, latitude, longitude, note, selfie_url, liveness_passed")
      .eq("company_id", active.id)
      .gte("event_at", since)
      .order("event_at", { ascending: false }),
    // Pending overtime awaiting approval — owner/admin only (matches RLS).
    canApproveOvertime
      ? supabase
          .from("overtime_entries")
          .select("id, employee_id, date, duration_minutes, multiplier")
          .eq("company_id", active.id)
          .eq("is_approved", false)
          .order("date", { ascending: false })
      : Promise.resolve({ data: [] as PendingOvertime[] }),
  ]);

  const nameById: Record<string, string> = {};
  for (const e of (employees as { id: string; full_name: string }[] | null) ?? []) {
    nameById[e.id] = e.full_name;
  }

  const initial = ((records as RecordRow[] | null) ?? []) as AttendanceRecord[];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ICONS["attendance"]}
        title={t("title")}
        description={t("subtitle", { name: active.name })}
        actions={
          canConfigure && (
            <IconButton icon={Settings} label={t("configure")} href="/attendance/config" />
          )
        }
      />

      {active.role === "employee" && <ClockInOut />}

      {canApproveOvertime && (
        <OvertimeQueue
          pending={(pendingOvertime as PendingOvertime[] | null) ?? []}
          nameById={nameById}
        />
      )}

      <LiveBoard
        companyId={active.id}
        nameById={nameById}
        initialRecords={initial}
        canCorrect={canCorrect}
      />
    </div>
  );
}
