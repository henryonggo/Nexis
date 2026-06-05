"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  generateApiKey,
  revokeApiKey,
  createWebhook,
  setWebhookActive,
  deleteWebhook,
  API_SCOPES,
  WEBHOOK_EVENTS,
} from "@/lib/developer";

/** `secret` carries the one-time plaintext key/secret back to the UI. */
export type DeveloperActionState = { error?: string; ok?: boolean; secret?: string };

function isOwnerAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

async function guard(): Promise<{ companyId: string } | { error: string }> {
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (!isOwnerAdmin(active.role)) {
    return { error: "Hanya pemilik atau admin yang dapat mengelola integrasi." };
  }
  return { companyId: active.id };
}

const keySchema = z.object({
  name: z.string().trim().min(1, "Nama kunci wajib diisi.").max(120),
  scopes: z
    .array(z.enum(API_SCOPES))
    .min(1, "Pilih minimal satu scope."),
});

export async function generateKeyAction(
  _prev: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const parsed = keySchema.safeParse({
    name: formData.get("name"),
    scopes: formData.getAll("scopes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { key, error } = await generateApiKey(createClient(), g.companyId, {
    name: parsed.data.name,
    scopes: parsed.data.scopes,
  });
  if (error) return { error };

  revalidatePath("/developer");
  return { ok: true, secret: key };
}

export async function revokeKeyAction(
  _prev: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const keyId = z.string().uuid().safeParse(formData.get("keyId"));
  if (!keyId.success) return { error: "Kunci tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { error } = await revokeApiKey(createClient(), g.companyId, keyId.data);
  if (error) return { error };

  revalidatePath("/developer");
  return { ok: true };
}

const webhookSchema = z.object({
  url: z.string().trim().url("URL endpoint tidak valid.").max(500),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pilih minimal satu event."),
});

export async function createWebhookAction(
  _prev: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const parsed = webhookSchema.safeParse({
    url: formData.get("url"),
    events: formData.getAll("events"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { secret, error } = await createWebhook(createClient(), g.companyId, parsed.data);
  if (error) return { error };

  revalidatePath("/developer");
  return { ok: true, secret };
}

export async function toggleWebhookAction(
  _prev: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const webhookId = z.string().uuid().safeParse(formData.get("webhookId"));
  const isActive = formData.get("isActive") === "true";
  if (!webhookId.success) return { error: "Webhook tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  // The hidden field carries the *current* state; flip it.
  const { error } = await setWebhookActive(createClient(), g.companyId, webhookId.data, !isActive);
  if (error) return { error };

  revalidatePath("/developer");
  return { ok: true };
}

export async function deleteWebhookAction(
  _prev: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const webhookId = z.string().uuid().safeParse(formData.get("webhookId"));
  if (!webhookId.success) return { error: "Webhook tidak valid." };

  const g = await guard();
  if ("error" in g) return { error: g.error };

  const { error } = await deleteWebhook(createClient(), g.companyId, webhookId.data);
  if (error) return { error };

  revalidatePath("/developer");
  return { ok: true };
}
