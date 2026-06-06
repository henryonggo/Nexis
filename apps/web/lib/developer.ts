import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";

/**
 * Developer surface — Stage 7 public API & webhooks (owner/admin only by RLS).
 *
 * Wired to the generated schema: `company_api_keys`, `company_webhooks`,
 * `webhook_logs`, and the `generate_api_key` RPC (returns the plaintext key
 * exactly once; only the SHA-256 hash is stored). Edge Functions `public-api` and
 * `dispatch-webhook` are Antigravity's lane.
 */

// Scope/event catalog is client-safe and lives in developer-constants.ts so the
// client key/webhook forms can import it without pulling in this server-only module.
export { API_SCOPES, WEBHOOK_EVENTS } from "./developer-constants";
export type { ApiScope, WebhookEvent } from "./developer-constants";

// ── API keys ─────────────────────────────────────────────────────────────────

export interface ApiKeyView {
  id: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

type ApiKeyRow = Pick<
  Database["public"]["Tables"]["company_api_keys"]["Row"],
  "id" | "name" | "scopes" | "is_active" | "last_used_at" | "expires_at" | "created_at"
>;

export async function getApiKeys(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<ApiKeyView[]> {
  const { data } = await supabase
    .from("company_api_keys")
    .select("id, name, scopes, is_active, last_used_at, expires_at, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as ApiKeyRow[] | null) ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    scopes: k.scopes,
    isActive: k.is_active,
    lastUsedAt: k.last_used_at,
    expiresAt: k.expires_at,
    createdAt: k.created_at,
  }));
}

/**
 * Generate a new API key. Returns the plaintext token ONCE (the DB stores only its
 * hash) — the caller must surface it immediately; it can never be retrieved again.
 */
export async function generateApiKey(
  supabase: SupabaseClient<Database>,
  companyId: string,
  input: { name: string; scopes: string[]; expiresAt?: string },
): Promise<{ key?: string; error?: string }> {
  const { data, error } = await supabase.rpc("generate_api_key", {
    p_company_id: companyId,
    p_name: input.name,
    p_scopes: input.scopes,
    p_expires_at: input.expiresAt,
  });
  if (error) return { error: error.message };
  return { key: data as string };
}

/** Revoke a key (soft — keeps the audit trail; the public-api rejects inactive keys). */
export async function revokeApiKey(
  supabase: SupabaseClient<Database>,
  companyId: string,
  keyId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("company_api_keys")
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("company_id", companyId);
  return error ? { error: error.message } : {};
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookView {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

type WebhookRow = Pick<
  Database["public"]["Tables"]["company_webhooks"]["Row"],
  "id" | "url" | "events" | "is_active" | "created_at"
>;

export async function getWebhooks(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<WebhookView[]> {
  const { data } = await supabase
    .from("company_webhooks")
    .select("id, url, events, is_active, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as WebhookRow[] | null) ?? []).map((w) => ({
    id: w.id,
    url: w.url,
    events: w.events,
    isActive: w.is_active,
    createdAt: w.created_at,
  }));
}

/**
 * Register a webhook endpoint. Generates a signing secret server-side and returns
 * it ONCE so the integrator can verify the HMAC signature on delivered payloads.
 */
export async function createWebhook(
  supabase: SupabaseClient<Database>,
  companyId: string,
  input: { url: string; events: string[] },
): Promise<{ secret?: string; error?: string }> {
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const { error } = await supabase.from("company_webhooks").insert({
    company_id: companyId,
    url: input.url,
    events: input.events,
    secret,
  });
  if (error) return { error: error.message };
  return { secret };
}

export async function setWebhookActive(
  supabase: SupabaseClient<Database>,
  companyId: string,
  webhookId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("company_webhooks")
    .update({ is_active: isActive })
    .eq("id", webhookId)
    .eq("company_id", companyId);
  return error ? { error: error.message } : {};
}

export async function deleteWebhook(
  supabase: SupabaseClient<Database>,
  companyId: string,
  webhookId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("company_webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("company_id", companyId);
  return error ? { error: error.message } : {};
}

// ── Delivery logs ────────────────────────────────────────────────────────────

export interface WebhookLogView {
  id: string;
  webhookId: string;
  eventType: string;
  status: string;
  responseStatus: number | null;
  attemptNumber: number;
  createdAt: string;
}

type WebhookLogRow = Pick<
  Database["public"]["Tables"]["webhook_logs"]["Row"],
  "id" | "webhook_id" | "event_type" | "status" | "response_status" | "attempt_number" | "created_at"
>;

/** Recent webhook delivery attempts for the company (owner/admin read). */
export async function getWebhookLogs(
  supabase: SupabaseClient<Database>,
  companyId: string,
  limit = 20,
): Promise<WebhookLogView[]> {
  const { data } = await supabase
    .from("webhook_logs")
    .select("id, webhook_id, event_type, status, response_status, attempt_number, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as WebhookLogRow[] | null) ?? []).map((l) => ({
    id: l.id,
    webhookId: l.webhook_id,
    eventType: l.event_type,
    status: l.status,
    responseStatus: l.response_status,
    attemptNumber: l.attempt_number,
    createdAt: l.created_at,
  }));
}
