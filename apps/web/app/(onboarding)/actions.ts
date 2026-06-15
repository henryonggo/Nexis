"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCompanySchema } from "@/lib/validation";

export type OnboardingState = { error?: string; pending?: boolean };

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

export async function joinCompanyWithCode(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const code = (formData.get("code") as string)?.trim();
  if (!code) {
    return { error: "Kode perusahaan harus diisi." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Self-request to join by company join code. Creates a pending request that an
  // owner/admin approves and assigns a role to (two-way-join handoff). The user is
  // NOT a member yet — show a pending state, don't redirect.
  const { error } = await supabase.rpc("request_company_join", { p_join_code: code });

  if (error) {
    const MESSAGES: Record<string, string> = {
      INVALID_CODE: "Kode perusahaan tidak ditemukan.",
      ALREADY_MEMBER: "Anda sudah menjadi anggota perusahaan ini.",
      ALREADY_PENDING: "Permintaan Anda sudah dikirim dan menunggu persetujuan.",
    };
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: key ? MESSAGES[key]! : error.message };
  }

  return { pending: true };
}
