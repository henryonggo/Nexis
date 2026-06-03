import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import type { CompanyBillingRow } from "@nexis/types";

export default async function DashboardPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const { count: employeeCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", active.id);

  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan, free_seat_limit, active_seats")
    .eq("company_id", active.id)
    .maybeSingle<Pick<CompanyBillingRow, "plan" | "free_seat_limit" | "active_seats">>();

  const limit = billing?.free_seat_limit ?? 5;
  const used = employeeCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="text-sm text-muted">Perusahaan: {active.name}</p>
      </div>

      {billing?.plan === "free" && (
        <div className="rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark">
          Paket <strong>Gratis</strong>: {used}/{limit} karyawan terpakai, tanpa perlu NPWP
          perusahaan.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/employees" className="rounded-lg border border-[color:var(--border)] bg-white p-5 hover:border-brand">
          <div className="text-sm text-muted">Karyawan</div>
          <div className="mt-1 text-2xl font-bold text-ink">
            {used} / {billing?.plan === "free" ? limit : "∞"}
          </div>
          <div className="mt-1 text-xs text-muted">Kelola karyawan →</div>
        </Link>
        <Link href="/attendance" className="rounded-lg border border-[color:var(--border)] bg-white p-5 hover:border-brand">
          <div className="text-sm text-muted">Kehadiran hari ini</div>
          <div className="mt-1 text-2xl font-bold text-ink">Langsung</div>
          <div className="mt-1 text-xs text-muted">Lihat dashboard →</div>
        </Link>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-5">
          <div className="text-sm text-muted">Payroll bulan ini</div>
          <div className="mt-1 text-2xl font-bold text-ink">—</div>
          <div className="mt-1 text-xs text-muted">Stage 4</div>
        </div>
      </div>
    </div>
  );
}
