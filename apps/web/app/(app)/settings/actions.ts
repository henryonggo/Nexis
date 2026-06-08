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

  const { error } = await supabase.rpc("deactivate_current_user");

  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect("/sign-in?deactivated=1");
}
