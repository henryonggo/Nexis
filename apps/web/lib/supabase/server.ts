import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@nexis/types";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-based Supabase client for Server Components, Server Actions and Route
 * Handlers. Uses the anon key + the user's session cookie — RLS still applies.
 * NEVER use the service-role key here for user-driven requests.
 */
export function createClient(): SupabaseClient<Database> {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes.
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
