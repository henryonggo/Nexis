"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperadmin } from "@/lib/superadmin";

export type FreePassState = { error?: string; ok?: boolean };

const schema = z.object({
  companyId: z.string().uuid(),
  // "grant" gives the comped-enterprise free pass; "revoke" returns to free.
  action: z.enum(["grant", "revoke"]),
});

// A comped company is represented as an enterprise plan: the free-seat DB trigger
// only blocks `plan='free'`, and every app-side gate keys off `plan==='free'`, so
// flipping to enterprise lifts the 5-seat cap and unlocks all paid features at once.
const COMPED_SEAT_LIMIT = 1_000_000;
const DEFAULT_FREE_SEAT_LIMIT = 5;

/**
 * Grant or revoke a company's "free pass" (full platform access, no seat limit).
 * Superadmin only. Uses the service-role client because a superadmin is not a
 * member of the target company, so RLS would otherwise hide it — the email
 * allowlist in `getSuperadmin()` is the authorization boundary.
 */
export async function setCompanyFreePass(
  _prev: FreePassState,
  formData: FormData,
): Promise<FreePassState> {
  const admin = await getSuperadmin();
  if (!admin) return { error: "Hanya superadmin platform yang dapat melakukan ini." };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di lingkungan ini." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { companyId, action } = parsed.data;

  const grant = action === "grant";
  const supabase = createAdminClient();

  // Upsert the billing row so a company without one can still be comped.
  const { error } = await supabase
    .from("company_billing")
    .upsert(
      {
        company_id: companyId,
        plan: grant ? "enterprise" : "free",
        free_seat_limit: grant ? COMPED_SEAT_LIMIT : DEFAULT_FREE_SEAT_LIMIT,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
  if (error) return { error: error.message };

  // Audit the comp (sensitive, cross-tenant). Best-effort: never block on it.
  await supabase.from("audit_logs").insert({
    company_id: companyId,
    actor_id: admin.id,
    action: grant ? "company.free_pass_granted" : "company.free_pass_revoked",
    entity: "company_billing",
    entity_id: companyId,
    metadata: { by: admin.email, plan: grant ? "enterprise" : "free" },
  });

  revalidatePath("/superadmin");
  return { ok: true };
}
