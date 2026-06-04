"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { approveClaim, rejectClaim, type DecisionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: DecisionState = {};

/** Approve / reject controls for one pending reimbursement claim. */
export function ClaimDecisionButtons({ claimId }: { claimId: string }) {
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
          <SubmitButton>Setujui</SubmitButton>
        </form>
        {rejecting ? (
          <form action={reject} className="flex items-center gap-2">
            <input type="hidden" name="claimId" value={claimId} />
            <input
              type="text"
              name="note"
              placeholder="Alasan penolakan (opsional)"
              className="rounded-md border border-[color:var(--border)] px-2 py-1.5 text-sm"
            />
            <SubmitButton>Tolak</SubmitButton>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-sm text-muted hover:underline"
            >
              Batal
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold text-ink hover:bg-brand-light"
          >
            Tolak
          </button>
        )}
      </div>
    </div>
  );
}
