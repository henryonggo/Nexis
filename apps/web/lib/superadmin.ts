import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Platform superadmin gating. Superadmins are the platform operators (us), NOT a
 * per-company role — they sit *above* tenancy and can comp any company. There is
 * deliberately no DB role for this: membership is an allowlist of emails in the
 * `NEXIS_SUPERADMIN_EMAILS` env var (comma-separated), so granting/revoking
 * superadmin is an ops action (env change), never something a tenant can escalate
 * into. Everything here is server-only.
 */

/** Parsed, lowercased superadmin allowlist from the environment. */
function allowlist(): Set<string> {
  return new Set(
    (process.env.NEXIS_SUPERADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whether an email belongs to the superadmin allowlist. */
export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowlist().has(email.toLowerCase());
}

/** Whether the platform has any superadmin configured (drives nav visibility). */
export function superadminConfigured(): boolean {
  return allowlist().size > 0;
}

/**
 * The signed-in user's email if they are a superadmin, else null. Use this to gate
 * the platform-admin surface and its actions — every superadmin action must call it.
 */
export async function getSuperadmin(): Promise<{ id: string; email: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isSuperadminEmail(user.email)) return null;
  return { id: user.id, email: user.email };
}
