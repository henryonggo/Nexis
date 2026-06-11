"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@nexis/types";
import { correctRecord, type CorrectionState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export type AttendanceRecord = Pick<
  Database["public"]["Tables"]["attendance_records"]["Row"],
  "id" | "employee_id" | "kind" | "event_at" | "is_valid" | "latitude" | "longitude" | "note" | "selfie_url"
>;

type Kind = Database["public"]["Enums"]["attendance_kind"];

const WIB = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

function isPresent(kind: Kind): boolean {
  return kind === "clock_in" || kind === "break_end";
}

export function LiveBoard({
  companyId,
  nameById,
  initialRecords,
  canCorrect,
}: {
  companyId: string;
  nameById: Record<string, string>;
  initialRecords: AttendanceRecord[];
  canCorrect: boolean;
}) {
  const t = useTranslations("attendance");
  const tk = useTranslations("attendance.kind");
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`attendance:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          setRecords((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as AttendanceRecord).id);
            }
            const row = payload.new as AttendanceRecord;
            const rest = prev.filter((r) => r.id !== row.id);
            return [row, ...rest].sort((a, b) => b.event_at.localeCompare(a.event_at));
          });
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // Current status = latest event per employee today.
  const current = useMemo(() => {
    const latest = new Map<string, AttendanceRecord>();
    for (const r of records) {
      if (!latest.has(r.employee_id)) latest.set(r.employee_id, r);
    }
    return [...latest.values()].sort((a, b) =>
      (nameById[a.employee_id] ?? "").localeCompare(nameById[b.employee_id] ?? ""),
    );
  }, [records, nameById]);

  const presentCount = current.filter((r) => isPresent(r.kind)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            live ? "bg-success/10 text-success" : "bg-brand-light text-muted"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${live ? "bg-success animate-pulse" : "bg-muted"}`}
          />
          {live ? t("live") : t("connecting")}
        </span>
        <span className="text-muted">
          <strong className="text-ink">{presentCount}</strong> {t("present")}
        </span>
      </div>

      {/* Current status board */}
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.employee")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.time")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted">
                  {t("noneToday")}
                </TableCell>
              </TableRow>
            )}
            {current.map((r) => (
              <TableRow key={r.employee_id}>
                <TableCell className="text-ink">{nameById[r.employee_id] ?? t("unknown")}</TableCell>
                <TableCell>
                  <Badge variant={isPresent(r.kind) ? "success" : "secondary"}>{tk(r.kind)}</Badge>
                </TableCell>
                <TableCell className="text-muted">{WIB.format(new Date(r.event_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Full event log */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">{t("eventLog")}</h2>
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.employee")}</TableHead>
                <TableHead>{t("columns.event")}</TableHead>
                <TableHead>{t("columns.time")}</TableHead>
                <TableHead>{t("columns.validity")}</TableHead>
                {canCorrect && <TableHead>{t("columns.correction")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canCorrect ? 5 : 4} className="py-6 text-center text-muted">
                    {t("noEvents")}
                  </TableCell>
                </TableRow>
              )}
              {records.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="text-ink">{nameById[r.employee_id] ?? t("unknown")}</TableCell>
                  <TableCell className="text-muted">{tk(r.kind)}</TableCell>
                  <TableCell className="text-muted">{WIB.format(new Date(r.event_at))}</TableCell>
                  <TableCell>
                    {r.is_valid ? (
                      <span className="text-xs text-success">{t("valid")}</span>
                    ) : (
                      <span className="text-xs text-danger">{t("outOfArea")}</span>
                    )}
                  </TableCell>
                  {canCorrect && (
                    <TableCell>
                      <CorrectionForm record={r} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function CorrectionForm({ record }: { record: AttendanceRecord }) {
  const t = useTranslations("attendance");
  const [state, formAction] = useFormState<CorrectionState, FormData>(correctRecord, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="isValid" value={record.is_valid ? "false" : "true"} />
      <Input
        type="text"
        name="note"
        defaultValue={record.note ?? ""}
        placeholder={t("notePlaceholder")}
        className="h-8 w-28 text-xs"
      />
      <CorrectionButton invalidating={record.is_valid} />
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
      {state.success && <span className="text-xs text-success">{state.success}</span>}
    </form>
  );
}

function CorrectionButton({ invalidating }: { invalidating: boolean }) {
  const t = useTranslations("attendance");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {invalidating ? t("markInvalid") : t("approve")}
    </Button>
  );
}
