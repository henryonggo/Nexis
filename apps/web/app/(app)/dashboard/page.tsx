import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { formatPeriod, formatRupiah } from "@/lib/payroll-format";
import { planMeta } from "@/lib/billing-plans";
import type { CompanyBillingRow } from "@nexis/types";

const RUN_STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  queued: "Antre",
  processing: "Diproses",
  completed: "Selesai",
  paid: "Dibayar",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

export default async function DashboardPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const isAdmin = active.role === "owner" || active.role === "admin";

  const [{ count: employeeCount }, { data: billing }, { data: latestRun }] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("company_id", active.id),
    supabase
      .from("company_billing")
      .select("plan, free_seat_limit, active_seats")
      .eq("company_id", active.id)
      .maybeSingle<Pick<CompanyBillingRow, "plan" | "free_seat_limit" | "active_seats">>(),
    supabase
      .from("payroll_runs")
      .select("id, period_year, period_month, status, total_net")
      .eq("company_id", active.id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const plan = planMeta(billing?.plan ?? "free");
  const limit = billing?.free_seat_limit ?? 5;
  const used = employeeCount ?? 0;
  const isFree = plan.id === "free";
  const atLimit = isFree && used >= limit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="text-sm text-muted">Perusahaan: {active.name}</p>
      </div>

      {isFree && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark">
          <span>
            Paket <strong>Gratis</strong>: {used}/{limit} karyawan terpakai
            {atLimit ? " — batas tercapai." : ", tanpa perlu NPWP perusahaan."}
          </span>
          {isAdmin && (
            <Link
              href="/billing"
              className="shrink-0 rounded-md bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark"
            >
              Upgrade paket
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/employees" className="rounded-lg border border-[color:var(--border)] bg-white p-5 hover:border-brand">
          <div className="text-sm text-muted">Karyawan</div>
          <div className="mt-1 text-2xl font-bold text-ink">
            {used}
            {isFree ? <span className="text-base text-muted"> / {limit}</span> : null}
          </div>
          <div className="mt-1 text-xs text-muted">{plan.label} · Kelola karyawan →</div>
        </Link>

        <Link href="/attendance" className="rounded-lg border border-[color:var(--border)] bg-white p-5 hover:border-brand">
          <div className="text-sm text-muted">Kehadiran hari ini</div>
          <div className="mt-1 text-2xl font-bold text-ink">Langsung</div>
          <div className="mt-1 text-xs text-muted">Lihat dashboard →</div>
        </Link>

        <Link href="/payroll" className="rounded-lg border border-[color:var(--border)] bg-white p-5 hover:border-brand">
          <div className="text-sm text-muted">Payroll terakhir</div>
          {latestRun ? (
            <>
              <div className="mt-1 text-2xl font-bold text-ink">
                {formatPeriod(latestRun.period_year, latestRun.period_month)}
              </div>
              <div className="mt-1 text-xs text-muted">
                {RUN_STATUS_LABELS[latestRun.status] ?? latestRun.status}
                {latestRun.total_net ? ` · ${formatRupiah(latestRun.total_net)}` : ""} →
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 text-2xl font-bold text-ink">—</div>
              <div className="mt-1 text-xs text-muted">Jalankan payroll →</div>
            </>
          )}
        </Link>
      </div>
    </div>
  );
}
