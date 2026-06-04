import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getReportJobs,
  getReportableRuns,
  getReportSignedUrl,
  reportTypeLabel,
} from "@/lib/reports";
import { ReportForm } from "./report-form";
import { ReportStatusBadge } from "./status-badge";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ReportsPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const canExport =
    active.role === "owner" || active.role === "admin" || active.role === "manager";
  if (!canExport) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">Laporan & Ekspor</h1>
        <p className="text-sm text-muted">
          Hanya pemilik, admin, atau manajer yang dapat membuat dan mengunduh laporan.
        </p>
      </div>
    );
  }

  const [runs, jobs] = await Promise.all([
    getReportableRuns(supabase, active.id),
    getReportJobs(supabase, active.id),
  ]);

  // Pre-sign download URLs for finished jobs (storage RLS limits this to admins).
  const downloadUrls = new Map<string, string>();
  await Promise.all(
    jobs
      .filter((j) => j.status === "completed" && j.outputPath)
      .map(async (j) => {
        const url = await getReportSignedUrl(supabase, j.outputPath!);
        if (url) downloadUrls.set(j.id, url);
      }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Laporan & Ekspor</h1>
        <p className="text-sm text-muted">
          Buat laporan payroll, BPJS, dan PPh 21 untuk {active.name} dalam format Excel.
        </p>
      </div>

      <ReportForm runs={runs} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Riwayat laporan
        </h2>
        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-light/60 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Jenis</th>
                <th className="px-4 py-2 font-medium">Periode</th>
                <th className="px-4 py-2 font-medium">Dibuat</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Belum ada laporan dibuat.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-t border-[color:var(--border)] align-top"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {reportTypeLabel(job.reportType)}
                    </td>
                    <td className="px-4 py-3 text-ink">{job.periodLabel ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {DATE_FMT.format(new Date(job.createdAt))}
                    </td>
                    <td className="px-4 py-3">
                      <ReportStatusBadge status={job.status} />
                      {job.status === "failed" && job.errorMessage && (
                        <p className="mt-1 max-w-xs text-xs text-red-600">{job.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {job.status === "completed" && downloadUrls.has(job.id) ? (
                        <a
                          href={downloadUrls.get(job.id)}
                          className="text-brand hover:underline"
                          download
                        >
                          Unduh Excel
                        </a>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
