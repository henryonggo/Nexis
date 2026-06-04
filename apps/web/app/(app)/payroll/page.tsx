import Link from "next/link";
import type { Database } from "@nexis/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { formatPeriod, formatRupiah } from "@/lib/payroll";
import { StatusBadge } from "./status-badge";

type RunRow = Pick<
  Database["public"]["Tables"]["payroll_runs"]["Row"],
  "id" | "period_year" | "period_month" | "status" | "total_gross" | "total_net" | "created_at"
>;

export default async function PayrollPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const isAdmin = active.role === "owner" || active.role === "admin";

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, period_year, period_month, status, total_gross, total_net, created_at")
    .eq("company_id", active.id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const rows = (runs as RunRow[] | null) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Penggajian</h1>
          <p className="text-sm text-muted">Jalankan dan tinjau payroll bulanan {active.name}.</p>
        </div>
        {isAdmin && (
          <Link
            href="/payroll/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Jalankan payroll
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Periode</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Bruto</th>
              <th className="px-4 py-2 text-right font-medium">Neto (take-home)</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Belum ada run payroll.{" "}
                  {isAdmin && (
                    <Link href="/payroll/new" className="text-brand hover:underline">
                      Jalankan yang pertama
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((run) => (
                <tr key={run.id} className="border-t border-[color:var(--border)] hover:bg-brand-light/30">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link href={`/payroll/${run.id}`} className="hover:underline">
                      {formatPeriod(run.period_year, run.period_month)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {formatRupiah(run.total_gross)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {formatRupiah(run.total_net)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/payroll/${run.id}`} className="text-brand hover:underline">
                      Tinjau
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
