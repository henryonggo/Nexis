"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@nexis/types";
import { SupabaseClient } from "@supabase/supabase-js";

/** Browser-side Supabase client (uses the public anon key only). */
export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as unknown as SupabaseClient<Database>;
}
