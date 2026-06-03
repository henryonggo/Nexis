"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCompanySchema } from "@/lib/validation";

export type OnboardingState = { error?: string };

export async function createFirstCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
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

  // Atomic provisioning: creates the company, owner membership, settings, and
  // a FREE billing row (5 free seats, no NPWP required). See migration RPC.
  const { error } = await supabase.rpc("create_company_with_owner", {
    p_name: parsed.data.name,
    p_industry: parsed.data.industry,
  });

  if (error) return { error: error.message };

  redirect("/dashboard");
}
