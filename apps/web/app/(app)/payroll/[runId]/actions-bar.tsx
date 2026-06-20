"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";
import { approveRun, cancelRun, markRunPaid, reopenRun, type RunActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Status = Database["public"]["Enums"]["pay_period_status"];

const initial: RunActionState = {};

export function ActionBar({ runId, status }: { runId: string; status: Status }) {
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
            <SubmitButton>{t("approve")}</SubmitButton>
          </form>
        )}
        {canMarkPaid && (
          <form action={markPaid}>
            <input type="hidden" name="runId" value={runId} />
            <SubmitButton>{t("markPaid")}</SubmitButton>
          </form>
        )}
        {canReopen && (
          <form action={reopen}>
            <input type="hidden" name="runId" value={runId} />
            <SubmitButton>{t("reopen")}</SubmitButton>
          </form>
        )}
        {canCancel && (
          <form action={cancel}>
            <input type="hidden" name="runId" value={runId} />
            <Button type="submit" variant="outline">
              {t("cancel")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
