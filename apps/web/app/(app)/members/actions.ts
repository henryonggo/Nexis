"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { sendInviteEmail } from "@/lib/email";

const inviteSchema = z.object({
  email: z.string().email("Email tidak valid"),
  role: z.enum(["admin", "manager", "employee"]),
});

export type MemberState = { error?: string; success?: string; inviteUrl?: string };

export async function inviteMember(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }

  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat mengundang anggota." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi berakhir." };

  const { data: invite, error } = await supabase
    .from("invitations")
    .insert({
      company_id: active.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      invited_by: user.id,
    })
    .select("token")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/members");

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = `${base}/invite/${invite!.token}`;

  // Try to email the invite. If Resend isn't configured (or fails), fall back to
  // surfacing the link in-app so the admin can share it manually.
  const mail = await sendInviteEmail({
    to: parsed.data.email,
    inviteUrl,
    companyName: active.name,
    role: parsed.data.role,
  });

  if (mail.sent) {
    return { success: `Undangan terkirim ke ${parsed.data.email}.` };
  }
  return {
    success: `Undangan dibuat untuk ${parsed.data.email}. Email belum dikonfigurasi — bagikan tautan ini:`,
    inviteUrl,
  };
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const id = formData.get("id") as string;
  const supabase = createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
  revalidatePath("/members");
}
