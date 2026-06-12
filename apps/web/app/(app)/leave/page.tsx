import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getCompanyLeaveRequests,
  getLeaveAttachmentUrl,
  type LeaveRequestView,
} from "@/lib/leave";
import { formatDateRange } from "@/lib/date";
import { LeaveStatusBadge } from "./status-badge";
import { PendingLeavesList } from "./pending-leaves-list";
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
  const attachmentUrls: Record<string, string> = {};
  await Promise.all(
    pending
      .filter((r) => r.attachmentPath)
      .map(async (r) => {
        const url = await getLeaveAttachmentUrl(supabase, r.attachmentPath!);
        if (url) attachmentUrls[r.id] = url;
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
        <PendingLeavesList
          pending={pending}
          canApprove={canApprove}
          attachmentUrls={attachmentUrls}
        />
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
