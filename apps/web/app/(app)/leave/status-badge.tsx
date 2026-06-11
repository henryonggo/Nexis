"use client";

import { useTranslations } from "next-intl";
import type { Database } from "@nexis/types";

type Status = Database["public"]["Enums"]["leave_status"];

const STYLES: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export function LeaveStatusBadge({ status }: { status: Status }) {
  const t = useTranslations("leave.status");
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {t(status)}
    </span>
  );
}
