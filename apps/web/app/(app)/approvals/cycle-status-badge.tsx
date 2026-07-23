"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type Status = "completed" | "awaiting_approval" | "halted" | "refusal" | "max_turns" | "error";

const VARIANT: Record<Status, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  completed: "success",
  awaiting_approval: "warning",
  halted: "warning",
  refusal: "destructive",
  max_turns: "destructive",
  error: "destructive",
};

export function AgentCycleStatusBadge({ status }: { status: string }) {
  const t = useTranslations("approvals.agent.cycleStatus");
  const variant = VARIANT[status as Status] ?? "default";
  return (
    <Badge variant={variant} dot>
      {t(status as Status)}
    </Badge>
  );
}
