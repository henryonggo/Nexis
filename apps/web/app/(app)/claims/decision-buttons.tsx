"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { approveClaim, rejectClaim, type DecisionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="claimId" value={claimId} />
          <SubmitButton>{t("approve")}</SubmitButton>
        </form>
        {rejecting ? (
          <form action={reject} className="flex items-center gap-2">
            <input type="hidden" name="claimId" value={claimId} />
            <Input type="text" name="note" placeholder={t("rejectReason")} className="w-40" />
            <SubmitButton>{t("reject")}</SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setRejecting(true)}>
            {t("reject")}
          </Button>
        )}
      </div>
    </div>
  );
}
