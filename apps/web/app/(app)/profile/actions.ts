"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ContactState = { error?: string; ok?: boolean };

const schema = z.object({
  phone: z.string().max(30).optional().or(z.literal("")),
  bankName: z.string().max(80).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  accountName: z.string().max(120).optional().or(z.literal("")),
});

/**
 * Self-service: any role updates their OWN contact phone + primary bank account.
 * Goes through a column-scoped RPC so a non-admin can change only these fields —
 * RLS alone can't restrict which columns of `employees` a self-update touches.
 */
export async function updateOwnContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const d = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // TODO(db): RPC update_own_contact(p_phone text, p_bank_name text, p_account_no text,
  // p_account_name text) SECURITY DEFINER, GRANT EXECUTE to authenticated. Resolves the
  // caller's own employee via user_id = auth.uid(), updates employees.phone, and upserts
  // their is_primary bank_accounts row. Column-scoped on purpose (self may change ONLY
  // contact + bank). Until it lands this errors for non-admins. — Antigravity
  const { error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }
  ).rpc("update_own_contact", {
    p_phone: d.phone || null,
    p_bank_name: d.bankName || null,
    p_account_no: d.accountNo || null,
    p_account_name: d.accountName || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}
