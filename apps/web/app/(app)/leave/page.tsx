import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getCompanyLeaveRequests,
  getLeaveAttachmentUrl,
  formatDateRange,
  type LeaveRequestView,
} from "@/lib/leave";
import { LeaveStatusBadge } from "./status-badge";
import { LeaveDecisionButtons } from "./decision-buttons";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export default async function LeavePage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("leave");
  const canApprove =
    active.role === "owner" || active.role === "admin" || active.role === "manager";

  const requests = await getCompanyLeaveRequests(supabase, active.id);
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  // Pre-sign attachments for pending rows (the queue the manager acts on).
  const attachmentUrls = new Map<string, string>();
  await Promise.all(
    pending
      .filter((r) => r.attachmentPath)
      .map(async (r) => {
        const url = await getLeaveAttachmentUrl(supabase, r.attachmentPath!);
        if (url) attachmentUrls.set(r.id, url);
      }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("pending", { count: pending.length })}
        </h2>
        {pending.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-muted">{t("noPending")}</Card>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{r.employeeName}</p>
                    <p className="text-sm text-muted">
                      {r.leaveTypeName} · {formatDateRange(r.startDate, r.endDate)} ·{" "}
                      <span className="font-medium text-ink">{r.days} {t("daysLabel")}</span>
                      {r.halfDay && ` ${t("halfDay")}`}
                    </p>
                    {r.reason && <p className="mt-1 text-sm text-ink">“{r.reason}”</p>}
                    {attachmentUrls.has(r.id) && (
                      <a
                        href={attachmentUrls.get(r.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm text-brand hover:underline"
                      >
                        {t("viewAttachment")}
                      </a>
                    )}
                  </div>
                  {canApprove && <LeaveDecisionButtons requestId={r.id} />}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("history")}</h2>
        <HistoryTable rows={decided} />
      </section>
    </div>
  );
}

async function HistoryTable({ rows }: { rows: LeaveRequestView[] }) {
  const t = await getTranslations("leave");
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.employee")}</TableHead>
            <TableHead>{t("columns.type")}</TableHead>
            <TableHead>{t("columns.period")}</TableHead>
            <TableHead className="text-right">{t("columns.days")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted">
                {t("noHistory")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-ink">{r.employeeName}</TableCell>
                <TableCell className="text-ink">{r.leaveTypeName}</TableCell>
                <TableCell className="text-ink">{formatDateRange(r.startDate, r.endDate)}</TableCell>
                <TableCell className="text-right tabular-nums text-ink">{r.days}</TableCell>
                <TableCell>
                  <LeaveStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
