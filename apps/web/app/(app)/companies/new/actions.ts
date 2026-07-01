"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCompanySchema } from "@/lib/validation";
import { setActiveCompany } from "@/app/(app)/actions";
import { acceptInvite } from "@/lib/actions/invitations";

export type CreateCompanyState = { error?: string };

/**
 * Create an additional company for an existing user (multi-company). Reuses the
 * same atomic RPC as onboarding, then switches the active company to the new one.
 */
export async function createCompany(
  _prev: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    industry: (formData.get("industry") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data, error } = await supabase.rpc("create_company_with_owner", {
    p_name: parsed.data.name,
    p_industry: parsed.data.industry,
  });

  if (error) return { error: error.message };

  // The RPC returns the new company id; make it the active company.
  if (typeof data === "string") {
    await setActiveCompany(data);
  }

  redirect("/dashboard");
}

/**
 * Join an existing company via an invite token. Calls acceptInvite which
 * handles the RPC call and redirects on success.
 */
export async function joinCompanyViaInvite(
  _prev: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const token = (formData.get("inviteToken") as string) || "";
  if (!token.trim()) {
    return { error: "Token undangan tidak boleh kosong." };
  }

  return acceptInvite(token.trim());
}
