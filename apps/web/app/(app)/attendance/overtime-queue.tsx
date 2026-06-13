"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { approveOvertime, rejectOvertime, type OvertimeState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export type PendingOvertime = {
  id: string;
  employee_id: string;
  date: string;
  duration_minutes: number;
  multiplier: number;
};

const initial: OvertimeState = {};

export function OvertimeQueue({
  pending,
  nameById,
}: {
  pending: PendingOvertime[];
  nameById: Record<string, string>;
}) {
  const t = useTranslations("attendance.overtime");

  if (pending.length === 0) return null;

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-ink">{t("title", { count: pending.length })}</h2>
      <p className="mb-4 text-sm text-muted">{t("hint")}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("employee")}</TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("hours")}</TableHead>
            <TableHead>{t("multiplier")}</TableHead>
            <TableHead className="w-28 text-right">{t("action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium text-ink">
                {nameById[o.employee_id] ?? t("unknown")}
              </TableCell>
              <TableCell className="text-muted">{o.date}</TableCell>
              <TableCell className="text-muted">{(o.duration_minutes / 60).toFixed(1)}</TableCell>
              <TableCell className="text-muted">×{o.multiplier}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <ActionButton action={approveOvertime} id={o.id} variant="approve" label={t("approve")} />
                  <ActionButton action={rejectOvertime} id={o.id} variant="reject" label={t("reject")} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ActionButton({
  action,
  id,
  variant,
  label,
}: {
  action: (prev: OvertimeState, fd: FormData) => Promise<OvertimeState>;
  id: string;
  variant: "approve" | "reject";
  label: string;
}) {
  const [, formAction] = useFormState(action, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitIcon variant={variant} label={label} />
    </form>
  );
}

function SubmitIcon({ variant, label }: { variant: "approve" | "reject"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant === "approve" ? "default" : "outline"}
      size="icon"
      disabled={pending}
      aria-busy={pending}
      aria-label={label}
      title={label}
    >
      {variant === "approve" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4 text-danger" />}
    </Button>
  );
}
