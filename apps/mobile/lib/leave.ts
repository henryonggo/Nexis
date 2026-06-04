import { supabase } from "./supabase";
import type { Database } from "@nexis/types";

export type LeaveStatus = Database["public"]["Enums"]["leave_status"];

export interface LeaveType {
  id: string;
  name: string;
  paid: boolean;
}

export interface LeaveBalanceView {
  leaveTypeId: string;
  leaveTypeName: string;
  available: number;
  used: number;
}

export interface MyLeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  leaveTypeName: string;
  decisionNote: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Count chargeable weekdays (Mon–Fri) in the inclusive range, for a 5-day week.
 * This mirrors `@nexis/leave#countLeaveDays` but without public-holiday data,
 * which the mobile client doesn't have. It is only an estimate for the stored
 * `days`/`half_day`; the `approve_leave` RPC is the authority on balance changes.
 */
export function estimateLeaveDays(startISO: string, endISO: string, halfDay = false): number {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  let count = 0;
  for (let t = start; t <= end; t += MS_PER_DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  if (halfDay) return startISO === endISO && count > 0 ? 0.5 : count;
  return count;
}

export async function getLeaveTypes(companyId: string): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from("leave_types")
    .select("id, name, paid")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return (data as LeaveType[] | null) ?? [];
}

/** The employee's current-year balances (opening + accrued + carried − used). */
export async function getMyBalances(
  employeeId: string,
  year = new Date().getUTCFullYear(),
): Promise<LeaveBalanceView[]> {
  const { data, error } = await supabase
    .from("leave_balances")
    .select("leave_type_id, opening_balance, accrued, carried_over, used, leave_types(name)")
    .eq("employee_id", employeeId)
    .eq("year", year);
  if (error) throw error;
  return ((data as any[] | null) ?? []).map((b) => ({
    leaveTypeId: b.leave_type_id,
    leaveTypeName: b.leave_types?.name ?? "—",
    available:
      Number(b.opening_balance) + Number(b.accrued) + Number(b.carried_over) - Number(b.used),
    used: Number(b.used),
  }));
}

export async function getMyLeaveRequests(employeeId: string): Promise<MyLeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, days, status, decision_note, leave_types(name)")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as any[] | null) ?? []).map((r) => ({
    id: r.id,
    startDate: r.start_date,
    endDate: r.end_date,
    days: Number(r.days),
    status: r.status,
    leaveTypeName: r.leave_types?.name ?? "—",
    decisionNote: r.decision_note,
  }));
}

/**
 * Submit a leave request (status defaults to `pending`). RLS enforces the
 * employee can only insert their own request for their own company.
 */
export async function submitLeaveRequest(args: {
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  reason?: string;
}): Promise<void> {
  const days = estimateLeaveDays(args.startDate, args.endDate, args.halfDay);
  if (days <= 0) throw new Error("Rentang tanggal tidak valid (tidak ada hari kerja).");
  const { error } = await supabase.from("leave_requests").insert({
    company_id: args.companyId,
    employee_id: args.employeeId,
    leave_type_id: args.leaveTypeId,
    start_date: args.startDate,
    end_date: args.endDate,
    days,
    half_day: args.halfDay,
    reason: args.reason || null,
  });
  if (error) throw error;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidISODate(s: string): boolean {
  return ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
