"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

/**
 * Set the active company from the portal and drop the user into the normal
 * company-scoped app. Validates membership (RLS-scoped) before flipping the
 * cookie, mirroring setActiveCompany but redirecting into /dashboard.
 */
export async function switchAndOpen(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const supabase = createClient();
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (data) {
    cookies().set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/dashboard");
}
