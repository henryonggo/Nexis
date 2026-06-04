import { formatRupiah } from "@nexis/money";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getHeadcountStats,
  getPayrollTrend,
  getApprovalStats,
  getLeaveUsage,
} from "@/lib/analytics";
import { BarList, TrendChart } from "./charts";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const isAdmin = active.role === "owner" || active.role === "admin";
  if (!isAdmin) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">Analitik</h1>
        <p className="text-sm text-muted">
          Hanya pemilik atau admin yang dapat melihat analitik perusahaan.
        </p>
      </div>
    );
  }

  const year = new Date().getFullYear();
  const [headcount, trend, approvals, leaveUsage] = await Promise.all([
    getHeadcountStats(supabase, active.id),
    getPayrollTrend(supabase, active.id),
    getApprovalStats(supabase, active.id),
    getLeaveUsage(supabase, active.id, year),
  ]);

  const latest = trend[trend.length - 1];
  const pendingTotal = approvals.pendingLeave + approvals.pendingClaims;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Analitik</h1>
        <p className="text-sm text-muted">
          Ringkasan headcount, biaya payroll, dan cuti {active.name}.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Karyawan aktif" value={String(headcount.active)} hint={`${headcount.total} total`} />
        <Kpi
          label="Bruto payroll terakhir"
          value={latest ? formatRupiah(latest.gross) : "—"}
          hint={latest ? latest.periodLabel : "Belum ada run"}
        />
        <Kpi
          label="BPJS perusahaan (terakhir)"
          value={latest ? formatRupiah(latest.bpjsEmployer) : "—"}
          hint={latest ? `PPh 21 ${formatRupiah(latest.pph21)}` : "—"}
        />
        <Kpi
          label="Menunggu persetujuan"
          value={String(pendingTotal)}
          hint={`${approvals.pendingLeave} cuti · ${approvals.pendingClaims} klaim`}
        />
      </div>

      {/* Payroll cost trend */}
      <section className="nx-card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Tren bruto payroll
        </h2>
        <TrendChart points={trend} />
      </section>

      {/* Headcount breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="nx-card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Karyawan per departemen
          </h2>
          <BarList
            items={headcount.byDepartment}
            unit="org"
            emptyText="Belum ada karyawan aktif."
          />
        </section>
        <section className="nx-card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Karyawan per tipe
          </h2>
          <BarList
            items={headcount.byEmploymentType}
            unit="org"
            emptyText="Belum ada karyawan aktif."
          />
        </section>
      </div>

      {/* Leave usage */}
      <section className="nx-card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Hari cuti disetujui ({year})
        </h2>
        <BarList items={leaveUsage} unit="hari" emptyText="Belum ada cuti disetujui tahun ini." />
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-white p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
