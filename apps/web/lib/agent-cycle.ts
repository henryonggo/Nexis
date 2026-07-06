import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  runPayrollCycle,
  type CycleResult,
  type ModelClient,
} from "@nexis/orchestrator";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { enqueuePayrollRun } from "@/lib/payroll-worker";

/**
 * The apps/web half of ADR 0004: construct the environment the orchestrator
 * runs in — the operator's RLS-scoped Supabase client (agents get no bypass),
 * the Cloud Tasks enqueue effect (ADR 0003), and the Anthropic client — and
 * run one stateless cycle. Durable state lives in approval_requests +
 * payroll_runs, so "resume" is just another invocation with approved request
 * ids as tokens.
 */
export async function runAgentCycleForActiveCompany(args: {
  instruction: string;
  approvalTokens?: Record<string, string>;
}): Promise<{ error: string } | { result: CycleResult }> {
  const active = await getActiveCompany();
  if (!active) return { error: "Tidak ada perusahaan aktif." };
  if (active.role !== "owner" && active.role !== "admin") {
    return { error: "Hanya pemilik/admin yang dapat menjalankan agen payroll." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error:
        "ANTHROPIC_API_KEY belum dikonfigurasi di lingkungan server. Tambahkan di pengaturan environment (Vercel) lalu coba lagi.",
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi berakhir. Masuk kembali." };

  // The SDK client satisfies ModelClient structurally; the cast shields us
  // from unrelated overloads on future SDK versions.
  const anthropic = new Anthropic() as unknown as ModelClient;

  const result = await runPayrollCycle({
    client: anthropic,
    toolContext: {
      supabase,
      companyId: active.id,
      actorId: user.id,
      effects: { enqueuePayrollRun },
    },
    instruction: args.instruction,
    approvalTokens: args.approvalTokens,
  });

  return { result };
}
