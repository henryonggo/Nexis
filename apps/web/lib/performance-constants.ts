// Client-safe performance catalog (no server-only imports) so the client status
// badges and review form can use the status labels/types. Server-side data access
// lives in lib/performance.ts, which re-exports these.
import type { Database } from "@nexis/types";

export type CycleStatus = "draft" | "active" | "closed";
export type GoalStatus = Database["public"]["Enums"]["goal_status"];
export type ReviewStatus = Database["public"]["Enums"]["review_status"];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  on_track: "Sesuai target",
  at_risk: "Berisiko",
  off_track: "Meleset",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "Draf",
  submitted: "Terkirim",
  acknowledged: "Disetujui karyawan",
};
