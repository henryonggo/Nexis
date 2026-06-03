import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ActiveCompany } from "@nexis/types";

export const ACTIVE_COMPANY_COOKIE = "nexis_company";

interface MembershipRow {
  role: ActiveCompany["role"];
  companies: { id: string; name: string; plan: ActiveCompany["plan"] } | null;
}

/** All companies the signed-in user belongs to (ordered by join time). */
export async function getMemberships(): Promise<ActiveCompany[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("company_members")
    .select("role, companies(id, name, plan)")
    .order("created_at", { ascending: true });

  return ((data as unknown as MembershipRow[] | null) ?? [])
    .filter((m) => m.companies)
    .map((m) => ({
      id: m.companies!.id,
      name: m.companies!.name,
      plan: m.companies!.plan,
      role: m.role,
    }));
}

/**
 * The active company for the current request, resolved from the cookie and
 * validated against the user's memberships. Falls back to the first company.
 * Returns null if the user has no companies (caller should redirect to onboarding).
 */
export async function getActiveCompany(
  memberships?: ActiveCompany[],
): Promise<ActiveCompany | null> {
  const list = memberships ?? (await getMemberships());
  if (list.length === 0) return null;

  const cookieId = cookies().get(ACTIVE_COMPANY_COOKIE)?.value;
  const matched = cookieId ? list.find((c) => c.id === cookieId) : undefined;
  return matched ?? list[0]!;
}
