import "server-only";
import { z } from "zod";
import type { Database } from "@nexis/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { PlanTier, PlanMeta } from "./billing-plans";
export {
  PLANS,
  planMeta,
  UPGRADEABLE_PLANS,
  estimateMonthlyCost,
  formatNpwp,
  formatRupiah,
} from "./billing-plans";

export type BillingRow = Database["public"]["Tables"]["company_billing"]["Row"];
export type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
export type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

/** The active company's billing record. RLS restricts reads to owner/admin. */
export async function getBilling(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<BillingRow | null> {
  const { data } = await supabase
    .from("company_billing")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as BillingRow | null) ?? null;
}

/** Invoices for the company, newest first. RLS restricts to owner/admin. */
export async function getInvoices(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<InvoiceRow[]> {
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as InvoiceRow[] | null) ?? [];
}

// ── Indonesian tax/BPJS identifier validation ────────────────────────────────
// NPWP: 15 digits (legacy) or 16 digits (NIK-based, since 2024). We validate the
// digit count after stripping formatting punctuation. BPJS account numbers are
// numeric strings; lengths vary by scheme so we accept 8–13 digits.

const digits = (s: string) => s.replace(/\D/g, "");

export const npwpSchema = z
  .string()
  .trim()
  .transform(digits)
  .refine((v) => v.length === 15 || v.length === 16, {
    message: "NPWP harus 15 atau 16 digit.",
  });

const bpjsSchema = z
  .string()
  .trim()
  .transform(digits)
  .refine((v) => v.length >= 8 && v.length <= 13, {
    message: "Nomor BPJS harus 8–13 digit.",
  });

export const upgradeSchema = z.object({
  plan: z.enum(["starter", "growth"]),
  npwp: npwpSchema,
  bpjsKes: bpjsSchema,
  bpjsTk: bpjsSchema,
  billingEmail: z.string().trim().email("Email penagihan tidak valid."),
});

export type UpgradeInput = z.infer<typeof upgradeSchema>;

/** Company legal/tax details, editable independently of a plan change. */
export const taxDetailsSchema = z.object({
  npwp: npwpSchema,
  bpjsKes: bpjsSchema,
  bpjsTk: bpjsSchema,
  billingEmail: z.string().trim().email("Email penagihan tidak valid."),
});

export type TaxDetailsInput = z.infer<typeof taxDetailsSchema>;
