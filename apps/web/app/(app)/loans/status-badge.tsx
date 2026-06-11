"use client";

import { useTranslations } from "next-intl";
import type { LoanStatus } from "@/lib/loans";

const STYLES: Record<LoanStatus, string> = {
  pending: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  active: "bg-amber-100 text-amber-800",
  settled: "bg-emerald-600 text-white",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  const t = useTranslations("loans.status");
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {t(status)}
    </span>
  );
}
