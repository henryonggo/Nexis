"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { upgradeSchema } from "@/lib/billing";

export type BillingActionState = { error?: string; ok?: boolean };

/**
 * Sandbox upgrade: move a company off the free plan and capture its legal/tax
 * details (NPWP + BPJS numbers, now required). Lifting `company_billing.plan`
 * above 'free' disables the free-seat trigger, so >5 employees become allowed.
 *
 * Only the owner can do this (RLS: "billing: owner write"). We also mirror the
 * tier onto `companies.plan`, which the app reads via getMemberships/ActiveCompany.
 *
 * TODO(infra): replace this direct flip with a real gateway checkout (Midtrans/
 * Xendit/Stripe). The payment-success webhook (service role, Antigravity's lane)
 * should create the `subscriptions` + `invoices` rows and set the plan — those
 * tables are service-role-only by RLS, so the app cannot write them here.
 */
export async function upgradePlan(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = upgradeSchema.safeParse({
    plan: formData.get("plan"),
    npwp: formData.get("npwp"),
    bpjsKes: formData.get("bpjsKes"),
    bpjsTk: formData.get("bpjsTk"),
    billingEmail: formData.get("billingEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner") {
    return { error: "Hanya pemilik perusahaan yang dapat meng-upgrade paket." };
  }

  const supabase = createClient();
  const { plan, npwp, bpjsKes, bpjsTk, billingEmail } = parsed.data;

  const { error: billingError } = await supabase
    .from("company_billing")
    .update({
      plan,
      npwp,
      bpjs_kes_no: bpjsKes,
      bpjs_tk_no: bpjsTk,
      billing_email: billingEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", active.id);
  if (billingError) return { error: billingError.message };

  // Keep companies.plan (the denormalized tier the app reads) in sync.
  const { error: companyError } = await supabase
    .from("companies")
    .update({ plan })
    .eq("id", active.id);
  if (companyError) return { error: companyError.message };

  revalidatePath("/billing");
  revalidatePath("/employees");
  return { ok: true };
}
