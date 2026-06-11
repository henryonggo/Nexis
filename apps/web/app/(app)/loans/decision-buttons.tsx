"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { approveLoanAction, rejectLoanAction, type LoanActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const initial: LoanActionState = {};

/** Approve / reject controls for one pending loan request. */
export function LoanDecisionButtons({ loanId }: { loanId: string }) {
  const t = useTranslations("decision");
  const [approveState, approve] = useFormState(approveLoanAction, initial);
  const [rejectState, reject] = useFormState(rejectLoanAction, initial);
  const [rejecting, setRejecting] = useState(false);
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="space-y-2">
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="loanId" value={loanId} />
          <SubmitButton>{t("approve")}</SubmitButton>
        </form>
        {rejecting ? (
          <form action={reject} className="flex items-center gap-2">
            <input type="hidden" name="loanId" value={loanId} />
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
