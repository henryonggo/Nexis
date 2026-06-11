"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { approveClaim, rejectClaim, type DecisionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: DecisionState = {};

/** Approve / reject controls for one pending reimbursement claim. */
export function ClaimDecisionButtons({ claimId }: { claimId: string }) {
  const t = useTranslations("decision");
  const [approveState, approve] = useFormState(approveClaim, initial);
  const [rejectState, reject] = useFormState(rejectClaim, initial);
  const [rejecting, setRejecting] = useState(false);
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="space-y-2">
      {error && <div className="nx-error">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="claimId" value={claimId} />
          <SubmitButton>{t("approve")}</SubmitButton>
        </form>
        {rejecting ? (
          <form action={reject} className="flex items-center gap-2">
            <input type="hidden" name="claimId" value={claimId} />
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
