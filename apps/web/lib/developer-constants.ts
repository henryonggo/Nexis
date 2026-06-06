// Client-safe developer catalog (no server-only imports) so the client key/webhook
// forms can use the scope/event lists. Server-side data access lives in
// lib/developer.ts, which re-exports these.

/** API scopes a key can be granted (must match the public-api Edge Function). */
export const API_SCOPES = [
  "employees:read",
  "employees:write",
  "attendance:read",
  "attendance:write",
  "payroll:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Webhook event types the dispatch trigger emits. */
export const WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "attendance.clock_in",
  "attendance.clock_out",
  "payroll.completed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
