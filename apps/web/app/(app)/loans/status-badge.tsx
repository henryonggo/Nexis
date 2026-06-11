"use client";

import { useTranslations } from "next-intl";
import type { LoanStatus } from "@/lib/loans";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<LoanStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  pending: "default",
  approved: "success",
  active: "warning",
  settled: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  const t = useTranslations("loans.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
