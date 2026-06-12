"use client";

import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";
import { Badge } from "@/components/ui/badge";

type Status = Database["public"]["Enums"]["pay_period_status"];

const VARIANT: Record<Status, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  queued: "default",
  processing: "default",
  completed: "success",
  paid: "success",
  failed: "destructive",
  cancelled: "secondary",
};

export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("payroll.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
