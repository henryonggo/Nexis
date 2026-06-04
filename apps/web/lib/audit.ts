import "server-only";
import type { Database } from "@nexis/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuditMetadata = Database["public"]["Tables"]["audit_logs"]["Row"]["metadata"];

/** Known audit actions → id-ID label + badge tone. Unknown actions humanize via fallback. */
const ACTION_META: Record<string, { label: string; tone: "approve" | "reject" | "neutral" }> = {
  approve_leave: { label: "Cuti disetujui", tone: "approve" },
  reject_leave: { label: "Cuti ditolak", tone: "reject" },
  approve_claim: { label: "Klaim disetujui", tone: "approve" },
  reject_claim: { label: "Klaim ditolak", tone: "reject" },
  correct_attendance: { label: "Kehadiran dikoreksi", tone: "neutral" },
};

const ENTITY_LABELS: Record<string, string> = {
  leave_requests: "Cuti",
  reimbursement_claims: "Klaim",
  attendance_records: "Kehadiran",
  employees: "Karyawan",
  payroll_runs: "Payroll",
  company_billing: "Tagihan",
};

export function actionLabel(action: string): string {
  return (
    ACTION_META[action]?.label ??
    action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export function actionTone(action: string): "approve" | "reject" | "neutral" {
  return ACTION_META[action]?.tone ?? "neutral";
}

export function entityLabel(entity: string | null): string {
  if (!entity) return "—";
  return ENTITY_LABELS[entity] ?? entity;
}

/** Distinct entities exposed in the filter dropdown (stable order). */
export const AUDIT_ENTITIES = [
  "leave_requests",
  "reimbursement_claims",
  "attendance_records",
  "employees",
  "payroll_runs",
  "company_billing",
] as const;

export interface AuditEntry {
  id: number;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorName: string;
  createdAt: string;
  metadata: AuditMetadata;
}

export interface AuditFilters {
  entity?: string;
  limit?: number;
}

/**
 * Recent audit-log entries for the company, newest first. RLS ("audit: admin read")
 * restricts this to owner/admin. Actor names are resolved via the company's employee
 * rows (admin-readable); `profiles` is self-read only, so non-employee actors (e.g. an
 * owner without an employee record) fall back to a generic label.
 */
export async function getAuditLog(
  supabase: SupabaseClient<Database>,
  companyId: string,
  filters: AuditFilters = {},
): Promise<AuditEntry[]> {
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, actor_id, created_at, metadata")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.entity) query = query.eq("entity", filters.entity);

  const { data } = await query;

  type Row = Pick<
    Database["public"]["Tables"]["audit_logs"]["Row"],
    "id" | "action" | "entity" | "entity_id" | "actor_id" | "created_at" | "metadata"
  >;
  const rows = (data as Row[] | null) ?? [];

  // Resolve actor names from employees (user_id → full_name).
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id))),
  );
  const nameByUser = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: emps } = await supabase
      .from("employees")
      .select("user_id, full_name")
      .eq("company_id", companyId)
      .in("user_id", actorIds);
    for (const e of (emps as { user_id: string | null; full_name: string }[] | null) ?? []) {
      if (e.user_id) nameByUser.set(e.user_id, e.full_name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    actorName: r.actor_id ? nameByUser.get(r.actor_id) ?? "Pengguna sistem" : "Sistem",
    createdAt: r.created_at,
    metadata: r.metadata,
  }));
}
