"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

export type DownloadState = { error?: string; urls?: { id: string; url: string }[] };

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(24) });

/**
 * Short-lived signed URLs for the requested payslips. RLS on `payslips` and the
 * storage policy guarantee the caller can only resolve their own PDFs — an id
 * for someone else's slip simply yields no row and is skipped.
 */
export async function getPayslipDownloadUrls(ids: string[]): Promise<DownloadState> {
  const parsed = schema.safeParse({ ids });
  if (!parsed.success) return { error: "Permintaan tidak valid." };

  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("payslips")
    .select("id, pdf_path")
    .in("id", parsed.data.ids)
    .eq("company_id", active.id);
  if (error) return { error: error.message };

  const urls: { id: string; url: string }[] = [];
  for (const row of (data as { id: string; pdf_path: string | null }[] | null) ?? []) {
    if (!row.pdf_path) continue;
    const { data: signed } = await supabase.storage
      .from("payslips")
      .createSignedUrl(row.pdf_path, 60);
    if (signed?.signedUrl) urls.push({ id: row.id, url: signed.signedUrl });
  }

  if (urls.length === 0) return { error: "Tidak ada slip gaji yang bisa diunduh." };
  return { urls };
}
