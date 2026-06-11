"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { approveLeave, rejectLeave, type DecisionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: DecisionState = {};

/** Approve / reject controls for one pending leave request (manager queue). */
export function LeaveDecisionButtons({ requestId }: { requestId: string }) {
  const t = useTranslations("decision");
  const [approveState, approve] = useFormState(approveLeave, initial);
  const [rejectState, reject] = useFormState(rejectLeave, initial);
  const [rejecting, setRejecting] = useState(false);
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="space-y-2">
      {error && <div className="nx-error">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="requestId" value={requestId} />
          <SubmitButton>{t("approve")}</SubmitButton>
        </form>
        {rejecting ? (
          <form action={reject} className="flex items-center gap-2">
            <input type="hidden" name="requestId" value={requestId} />
            <input
              type="text"
              name="note"
              placeholder={t("rejectReason")}
              className="rounded-md border border-[color:var(--border)] px-2 py-1.5 text-sm"
            />
            <SubmitButton>{t("reject")}</SubmitButton>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-sm text-muted hover:underline"
            >
              {t("cancel")}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold text-ink hover:bg-brand-light"
          >
            {t("reject")}
          </button>
        )}
      </div>
    </div>
  );
}
