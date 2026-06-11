"use client";

import { useTranslations } from "next-intl";
import type { GoalStatus, ReviewStatus } from "@/lib/performance-constants";

const GOAL_STYLES: Record<GoalStatus, string> = {
  on_track: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-amber-100 text-amber-700",
  off_track: "bg-red-100 text-red-700",
  done: "bg-emerald-600 text-white",
  cancelled: "bg-gray-100 text-gray-500",
};

const REVIEW_STYLES: Record<ReviewStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  acknowledged: "bg-emerald-600 text-white",
};

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const t = useTranslations("performance.goalStatus");
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${GOAL_STYLES[status]}`}>
      {t(status)}
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const t = useTranslations("performance.reviewStatus");
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${REVIEW_STYLES[status]}`}>
      {t(status)}
    </span>
  );
}
