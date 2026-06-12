"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/company";

const MESSAGES: Record<string, string> = {
  INVITE_INVALID: "Undangan tidak ditemukan atau sudah dipakai.",
  INVITE_EXPIRED: "Undangan sudah kedaluwarsa.",
  INVITE_EMAIL_MISMATCH: "Undangan ini ditujukan untuk alamat email lain.",
};

export type AcceptState = { error?: string };

export async function acceptInvite(token: string): Promise<AcceptState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?redirectTo=/invite/${token}`);

  // TODO(db): accept_invitation must also link employees.user_id = auth.uid()
  // for unclaimed employee rows matching the invited email in this company —
  // otherwise employee self-service (mobile profile, payslips, attendance,
  // leave, claims) sees nothing. Spec: docs/handoff/employee-user-linking.md — Antigravity
  const { data: companyId, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: key ? MESSAGES[key]! : error.message };
  }

  // Make the joined company the active one, then go to the dashboard.
  if (typeof companyId === "string") {
    cookies().set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/dashboard");
}
