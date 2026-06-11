"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { approveLeave, rejectLeave, type DecisionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="requestId" value={requestId} />
          <SubmitButton>{t("approve")}</SubmitButton>
        </form>
        {rejecting ? (
          <form action={reject} className="flex items-center gap-2">
            <input type="hidden" name="requestId" value={requestId} />
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
