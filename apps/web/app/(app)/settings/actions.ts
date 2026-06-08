"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string };

/**
 * Deactivate the current user's account (reversible). Flags the account
 * deactivated, then signs out and lands on sign-in with a notice. Reactivation is
 * handled out of band (support / re-enable) by design — there is no self-serve
 * hard delete.
 */
export async function deactivateAccount(): Promise<SettingsState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // TODO(db): need RPC deactivate_current_user() that sets profiles.deactivated_at
  //           (timestamptz, nullable) for auth.uid(), plus a login guard / RLS that
  //           blocks deactivated users from acting — Antigravity. Quarantine cast
  //           until the RPC is in the generated types.
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ error: { message: string } | null }>)("deactivate_current_user");

  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect("/sign-in?deactivated=1");
}
