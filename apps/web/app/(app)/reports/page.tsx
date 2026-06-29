import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getReportJobs,
  getReportableRuns,
  getReportSignedUrl,
} from "@/lib/reports";
import { ReportForm } from "./report-form";
import { ReportStatusBadge } from "./status-badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { IconButton } from "@/components/ui/icon-button";
import { ICONS } from "@/lib/nav";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

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

  const t = await getTranslations("reports");
  const tt = await getTranslations("reports.types");
  const canExport =
    active.role === "owner" || active.role === "admin" || active.role === "manager";
  if (!canExport) {
    return (
      <div className="space-y-6">
        <PageHeader icon={ICONS["reports"]} title={t("title")} />
        <Card className="max-w-lg p-8">
          <p className="text-sm text-muted">{t("noAccess")}</p>
        </Card>
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
      <PageHeader
        icon={ICONS["reports"]}
        title={t("title")}
        description={t("subtitle", { name: active.name })}
      />

      <ReportForm runs={runs} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("history")}
        </h2>
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.period")}</TableHead>
                <TableHead>{t("columns.created")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id} className="align-top">
                    <TableCell className="font-medium text-ink">
                      {tt(`${job.reportType}.label`)}
                    </TableCell>
                    <TableCell className="text-ink">{job.periodLabel ?? "—"}</TableCell>
                    <TableCell className="text-muted">
                      {DATE_FMT.format(new Date(job.createdAt))}
                    </TableCell>
                    <TableCell>
                      <ReportStatusBadge status={job.status} />
                      {job.status === "failed" && job.errorMessage && (
                        <p className="mt-1 max-w-xs text-xs text-danger">{job.errorMessage}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.status === "completed" && downloadUrls.has(job.id) ? (
                        <IconButton
                          icon={<Download className="h-[18px] w-[18px]" />}
                          label={t("download")}
                          href={downloadUrls.get(job.id)!}
                          tooltipSide="left"
                          variant="ghost"
                        />
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
