"use client";

import { useTranslations } from "next-intl";
import type { GoalStatus, ReviewStatus } from "@/lib/performance-constants";
import { Badge } from "@/components/ui/badge";

const GOAL_VARIANT: Record<GoalStatus, "success" | "warning" | "destructive" | "secondary"> = {
  on_track: "success",
  at_risk: "warning",
  off_track: "destructive",
  done: "success",
  cancelled: "secondary",
};

const REVIEW_VARIANT: Record<ReviewStatus, "secondary" | "default" | "success"> = {
  draft: "secondary",
  submitted: "default",
  acknowledged: "success",
};

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const t = useTranslations("performance.goalStatus");
  return <Badge variant={GOAL_VARIANT[status]}>{t(status)}</Badge>;
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const t = useTranslations("performance.reviewStatus");
  return <Badge variant={REVIEW_VARIANT[status]}>{t(status)}</Badge>;
}
