"use client";

import { useTranslations } from "next-intl";
import type { ReportJobStatus } from "@/lib/reports-format";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<ReportJobStatus, "default" | "success" | "destructive"> = {
  pending: "default",
  processing: "default",
  completed: "success",
  failed: "destructive",
};

export function ReportStatusBadge({ status }: { status: ReportJobStatus }) {
  const t = useTranslations("reports.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
