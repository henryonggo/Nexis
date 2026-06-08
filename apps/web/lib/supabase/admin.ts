import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexis/types";

/**
 * Service-role Supabase client for privileged server-only operations (e.g. minting
 * email-confirmation links via `auth.admin.generateLink`). NEVER expose this to the
 * browser and never use it for user-scoped reads — it bypasses RLS.
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
