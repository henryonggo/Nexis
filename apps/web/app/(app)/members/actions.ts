"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Include the company join code so the recipient can self-request if the link fails.
  const { data: company } = await supabase
    .from("companies")
    .select("join_code")
    .eq("id", active.id)
    .maybeSingle();
  const joinCode = (company as { join_code: string } | null)?.join_code ?? undefined;

  let emailSent = false;

  // Try to email the invite. If Resend isn't configured (or fails), fall back to
  // surfacing the link in-app so the admin can share it manually.
  if (process.env.RESEND_API_KEY) {
    const mail = await sendInviteEmail({
      to: parsed.data.email,
      inviteUrl,
      companyName: active.name,
      role: parsed.data.role,
      joinCode,
    });
    emailSent = mail.sent;
  } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        parsed.data.email.toLowerCase(),
        {
          redirectTo: inviteUrl,
          data: { full_name: "" }
        }
      );
      if (!inviteError) {
        emailSent = true;
      }
    } catch (e) {
      console.error("Failed to send invite email via Supabase admin client:", e);
    }
  }

  if (emailSent) {
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

/** Rotate the company join code (owner/admin). RLS/RPC enforce the role too. */
export async function rotateJoinCode(): Promise<void> {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return;
  if (active.role !== "owner" && active.role !== "admin") return;
  await supabase.rpc("rotate_company_join_code", { p_company_id: active.id });
  revalidatePath("/members");
}

const decideSchema = z.object({
  requestId: z.string().uuid("ID tidak valid"),
  role: z.enum(["admin", "manager", "employee"]),
});

const JOIN_ERRORS: Record<string, string> = {
  INSUFFICIENT_ROLE: "Anda tidak berwenang memberikan peran tersebut.",
  REQUEST_ALREADY_DECIDED: "Permintaan sudah diputuskan.",
  REQUEST_NOT_FOUND: "Permintaan tidak ditemukan.",
};

function mapJoinError(message: string): string {
  const key = Object.keys(JOIN_ERRORS).find((k) => message.includes(k));
  return key ? JOIN_ERRORS[key]! : message;
}

/** Approve a join request with the chosen role. The RPC enforces the grant matrix. */
export async function approveJoinRequest(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const parsed = decideSchema.safeParse({
    requestId: formData.get("requestId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };

  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat menyetujui permintaan." };
  }

  const { error } = await supabase.rpc("approve_join_request", {
    p_request_id: parsed.data.requestId,
    p_role: parsed.data.role,
  });
  if (error) return { error: mapJoinError(error.message) };

  revalidatePath("/members");
  return { success: "Permintaan disetujui." };
}

/** Reject a join request (owner/admin). */
export async function rejectJoinRequest(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const requestId = z.string().uuid().safeParse(formData.get("requestId"));
  if (!requestId.success) return { error: "ID tidak valid" };

  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat menolak permintaan." };
  }

  const { error } = await supabase.rpc("reject_join_request", {
    p_request_id: requestId.data,
  });
  if (error) return { error: mapJoinError(error.message) };

  revalidatePath("/members");
  return { success: "Permintaan ditolak." };
}
