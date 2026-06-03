"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

/** Switch the active company (validates membership) and refresh the UI. */
export async function setActiveCompany(companyId: string) {
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
    revalidatePath("/", "layout");
  }
}
