"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";
import { approveRun, cancelRun, markRunPaid, type RunActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

type Status = Database["public"]["Enums"]["pay_period_status"];

const initial: RunActionState = {};

export function ActionBar({ runId, status }: { runId: string; status: Status }) {
  const t = useTranslations("payroll.actions");
  const [approveState, approve] = useFormState(approveRun, initial);
  const [paidState, markPaid] = useFormState(markRunPaid, initial);
  const [cancelState, cancel] = useFormState(cancelRun, initial);
  const error = approveState.error ?? paidState.error ?? cancelState.error;

  const canApprove = status === "draft";
  const canMarkPaid = status === "completed";
  const canCancel = status === "draft" || status === "queued" || status === "failed";

  if (!canApprove && !canMarkPaid && !canCancel) return null;

  return (
    <div className="space-y-2">
      {error && <div className="nx-error">{error}</div>}
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
        {canCancel && (
          <form action={cancel}>
            <input type="hidden" name="runId" value={runId} />
            <button
              type="submit"
              className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light"
            >
              {t("cancel")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
