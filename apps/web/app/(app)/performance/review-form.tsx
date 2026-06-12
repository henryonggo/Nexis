"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import {
  saveReviewAction,
  submitReviewAction,
  type PerfActionState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ReviewStatusBadge } from "./status-badge";
import type { ReviewStatus } from "@/lib/performance-constants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: PerfActionState = {};

export interface ReviewFormProps {
  cycleId: string;
  employeeId: string;
  employeeName: string;
  reviewId: string | null;
  overallRating: number | null;
  summary: string | null;
  status: ReviewStatus | null;
}

/** Record + submit a performance review for one employee in a cycle. */
export function ReviewForm(props: ReviewFormProps) {
  const t = useTranslations("performance.reviewForm");
  const [saveState, save] = useFormState(saveReviewAction, initial);
  const [submitState, submit] = useFormState(submitReviewAction, initial);
  const error = saveState.error ?? submitState.error;

  const locked = props.status === "submitted" || props.status === "acknowledged";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-ink">{props.employeeName}</p>
        {props.status && <ReviewStatusBadge status={props.status} />}
      </div>

      {error && <Alert variant="destructive" className="mb-3">{error}</Alert>}

      {locked ? (
        <p className="text-sm text-muted">
          {t("finalScore")} <span className="font-medium text-ink">{props.overallRating ?? "—"}/5</span>
          {props.summary ? ` · ${props.summary}` : ""}
        </p>
      ) : (
        <>
          <form action={save} className="space-y-3">
            <input type="hidden" name="cycleId" value={props.cycleId} />
            <input type="hidden" name="employeeId" value={props.employeeId} />
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <Label htmlFor={`rating-${props.employeeId}`}>{t("rating")}</Label>
              <Input
                id={`rating-${props.employeeId}`}
                name="overallRating"
                type="number"
                min={1}
                max={5}
                step={0.5}
                defaultValue={props.overallRating ?? 3}
                className="w-28"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`summary-${props.employeeId}`}>{t("summary")}</Label>
              <Input
                id={`summary-${props.employeeId}`}
                name="summary"
                defaultValue={props.summary ?? ""}
                placeholder={t("summaryPlaceholder")}
              />
            </div>
            <SubmitButton>{t("saveDraft")}</SubmitButton>
          </form>

          {props.reviewId && (
            <form action={submit} className="mt-2">
              <input type="hidden" name="reviewId" value={props.reviewId} />
              <Button type="submit" variant="outline">
                {t("submit")}
              </Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
