"use client";

import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";
import { Badge } from "@/components/ui/badge";

type Status = Database["public"]["Enums"]["leave_status"];

const VARIANT: Record<Status, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

export function LeaveStatusBadge({ status }: { status: Status }) {
  const t = useTranslations("leave.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
