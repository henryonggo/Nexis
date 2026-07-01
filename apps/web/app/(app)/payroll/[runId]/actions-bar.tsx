"use client";

import { useFormState } from "react-dom";
import { CheckCircle2, Download, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";
import { approveRun, cancelRun, markRunPaid, reopenRun, type RunActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Status = Database["public"]["Enums"]["pay_period_status"];

const initial: RunActionState = {};

export function ActionBar({
  runId,
  status,
  allItemsPaid,
}: {
  runId: string;
  status: Status;
  // The run can only be closed to "paid" once every employee's item is confirmed
  // disbursed. Gates the run-level button against the per-employee cash ledger.
  allItemsPaid: boolean;
}) {
  const t = useTranslations("payroll.actions");
  const [approveState, approve] = useFormState(approveRun, initial);
  const [paidState, markPaid] = useFormState(markRunPaid, initial);
  const [cancelState, cancel] = useFormState(cancelRun, initial);
  const [reopenState, reopen] = useFormState(reopenRun, initial);
  const error = approveState.error ?? paidState.error ?? cancelState.error ?? reopenState.error;

  const canApprove = status === "draft";
  const canMarkPaid = status === "completed";
  // Include "processing": if the worker dies mid-run (or never reaches it), the
  // run would otherwise be stuck with no way to clear it. Cancelling lets the
  // admin reopen to draft and re-approve.
  const canCancel =
    status === "draft" ||
    status === "queued" ||
    status === "processing" ||
    status === "failed";
  const canReopen = status === "cancelled" || status === "failed";

  if (!canApprove && !canMarkPaid && !canCancel && !canReopen) return null;

  return (
    <div className="space-y-2">
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        {canApprove && (
          <form action={approve}>
            <input type="hidden" name="runId" value={runId} />
            <SubmitButton><CheckCircle2 className="w-4 h-4 mr-2" />{t("approve")}</SubmitButton>
          </form>
        )}
        {canMarkPaid && (
          <form action={markPaid}>
            <input type="hidden" name="runId" value={runId} />
            <SubmitButton disabled={!allItemsPaid}><Download className="w-4 h-4 mr-2" />{t("markPaid")}</SubmitButton>
            {!allItemsPaid && <p className="mt-1 text-xs text-muted">{t("markPaidBlocked")}</p>}
          </form>
        )}
        {canReopen && (
          <form action={reopen}>
            <input type="hidden" name="runId" value={runId} />
            <SubmitButton><RotateCcw className="w-4 h-4 mr-2" />{t("reopen")}</SubmitButton>
          </form>
        )}
        {canCancel && (
          <form action={cancel}>
            <input type="hidden" name="runId" value={runId} />
            <Button type="submit" variant="outline">
              <X className="w-4 h-4 mr-2" />{t("cancel")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
