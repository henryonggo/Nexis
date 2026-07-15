"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type Status = "pending" | "approved" | "rejected" | "consumed" | "expired";

const VARIANT: Record<Status, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  consumed: "secondary",
  expired: "secondary",
};

export function ApprovalStatusBadge({ status }: { status: string }) {
  const t = useTranslations("approvals.status");
  const variant = VARIANT[status as Status] ?? "default";
  return (
    <Badge variant={variant} dot>
      {t(status as Status)}
    </Badge>
  );
}
