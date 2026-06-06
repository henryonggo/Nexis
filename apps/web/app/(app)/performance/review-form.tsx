"use client";

import { useFormState } from "react-dom";
import {
  saveReviewAction,
  submitReviewAction,
  type PerfActionState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ReviewStatusBadge } from "./status-badge";
import type { ReviewStatus } from "@/lib/performance-constants";

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
  const [saveState, save] = useFormState(saveReviewAction, initial);
  const [submitState, submit] = useFormState(submitReviewAction, initial);
  const error = saveState.error ?? submitState.error;

  const locked = props.status === "submitted" || props.status === "acknowledged";

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-ink">{props.employeeName}</p>
        {props.status && <ReviewStatusBadge status={props.status} />}
      </div>

      {error && <div className="nx-error mb-3">{error}</div>}

      {locked ? (
        <p className="text-sm text-muted">
          Nilai akhir: <span className="font-medium text-ink">{props.overallRating ?? "—"}/5</span>
          {props.summary ? ` · ${props.summary}` : ""}
        </p>
      ) : (
        <>
          <form action={save} className="space-y-3">
            <input type="hidden" name="cycleId" value={props.cycleId} />
            <input type="hidden" name="employeeId" value={props.employeeId} />
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label className="nx-label mb-0" htmlFor={`rating-${props.employeeId}`}>
                Nilai (1–5)
              </label>
              <input
                id={`rating-${props.employeeId}`}
                name="overallRating"
                type="number"
                min={1}
                max={5}
                step={0.5}
                defaultValue={props.overallRating ?? 3}
                className="nx-input w-28"
              />
            </div>
            <div>
              <label className="nx-label" htmlFor={`summary-${props.employeeId}`}>
                Ringkasan
              </label>
              <input
                id={`summary-${props.employeeId}`}
                name="summary"
                className="nx-input"
                defaultValue={props.summary ?? ""}
                placeholder="Catatan penilaian"
              />
            </div>
            <SubmitButton>Simpan draf</SubmitButton>
          </form>

          {props.reviewId && (
            <form action={submit} className="mt-2">
              <input type="hidden" name="reviewId" value={props.reviewId} />
              <button
                type="submit"
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold text-ink hover:bg-brand-light"
              >
                Kirim penilaian
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
