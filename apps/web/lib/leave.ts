import "server-only";
import type { Database } from "@nexis/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LeaveStatus = Database["public"]["Enums"]["leave_status"];

/** A leave request joined with its type + the requesting employee, for the admin queue. */
export interface LeaveRequestView {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  halfDay: boolean;
  reason: string | null;
  attachmentPath: string | null;
  status: LeaveStatus;
  decisionNote: string | null;
  createdAt: string;
  employeeName: string;
  employeeUserId: string | null;
  leaveTypeName: string;
  paid: boolean;
}

interface RawLeaveRow {
  id: string;
  start_date: string;
  end_date: string;
  days: number;
  half_day: boolean;
  reason: string | null;
  attachment_path: string | null;
  status: LeaveStatus;
  decision_note: string | null;
  created_at: string;
  employees: { full_name: string; user_id: string | null } | null;
  leave_types: { name: string; paid: boolean } | null;
}

/**
 * Every leave request in the active company, newest first. RLS scopes the rows to
 * companies the caller manages (manager/admin/owner see the whole company; the
 * policy stops cross-company reads). The approval queue filters to `pending`.
 */
export async function getCompanyLeaveRequests(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<LeaveRequestView[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      // employees is embedded via the explicit FK: leave_requests has two FKs to
      // employees (employee_id + decided_by), so a bare embed is ambiguous (PGRST201).
      "id, start_date, end_date, days, half_day, reason, attachment_path, status, decision_note, created_at, employees!leave_requests_employee_id_fkey(full_name, user_id), leave_types(name, paid)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data as unknown as RawLeaveRow[] | null) ?? []).map((r) => ({
    id: r.id,
    startDate: r.start_date,
    endDate: r.end_date,
    days: Number(r.days),
    halfDay: r.half_day,
    reason: r.reason,
    attachmentPath: r.attachment_path,
    status: r.status,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    employeeName: r.employees?.full_name ?? "—",
    employeeUserId: r.employees?.user_id ?? null,
    leaveTypeName: r.leave_types?.name ?? "—",
    paid: r.leave_types?.paid ?? false,
  }));
}

/** A short-lived signed URL for a leave attachment in the private bucket. */
export async function getLeaveAttachmentUrl(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from("leave-attachments")
    .createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

import { formatDate, formatDateRange } from "./date";
