"use client";

import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";
import { Badge } from "@/components/ui/badge";

type Status = Database["public"]["Enums"]["claim_status"];

const VARIANT: Record<Status, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  paid: "success",
};

export function ClaimStatusBadge({ status }: { status: Status }) {
  const t = useTranslations("claims.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
