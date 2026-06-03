"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@nexis/types";
import { correctRecord, type CorrectionState } from "./actions";

export type AttendanceRecord = Pick<
  Database["public"]["Tables"]["attendance_records"]["Row"],
  "id" | "employee_id" | "kind" | "event_at" | "is_valid" | "latitude" | "longitude" | "note" | "selfie_url"
>;

type Kind = Database["public"]["Enums"]["attendance_kind"];

const KIND_LABEL: Record<Kind, string> = {
  clock_in: "Masuk",
  clock_out: "Keluar",
  break_start: "Mulai istirahat",
  break_end: "Selesai istirahat",
};

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
          {live ? "Langsung" : "Menyambung…"}
        </span>
        <span className="text-muted">
          <strong className="text-ink">{presentCount}</strong> sedang hadir
        </span>
      </div>

      {/* Current status board */}
      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Karyawan</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Waktu</th>
            </tr>
          </thead>
          <tbody>
            {current.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  Belum ada kehadiran hari ini.
                </td>
              </tr>
            )}
            {current.map((r) => (
              <tr key={r.employee_id} className="border-t border-[color:var(--border)]">
                <td className="px-4 py-2 text-ink">
                  {nameById[r.employee_id] ?? "(tidak dikenal)"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                      isPresent(r.kind)
                        ? "bg-success/10 text-success"
                        : "bg-brand-light text-muted"
                    }`}
                  >
                    {KIND_LABEL[r.kind]}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted">{WIB.format(new Date(r.event_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Full event log */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Log kejadian hari ini</h2>
        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-light/60 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Karyawan</th>
                <th className="px-4 py-2 font-medium">Kejadian</th>
                <th className="px-4 py-2 font-medium">Waktu</th>
                <th className="px-4 py-2 font-medium">Validitas</th>
                {canCorrect && <th className="px-4 py-2 font-medium">Koreksi</th>}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={canCorrect ? 5 : 4} className="px-4 py-6 text-center text-muted">
                    Belum ada kejadian.
                  </td>
                </tr>
              )}
              {records.map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--border)] align-top">
                  <td className="px-4 py-2 text-ink">
                    {nameById[r.employee_id] ?? "(tidak dikenal)"}
                  </td>
                  <td className="px-4 py-2 text-muted">{KIND_LABEL[r.kind]}</td>
                  <td className="px-4 py-2 text-muted">{WIB.format(new Date(r.event_at))}</td>
                  <td className="px-4 py-2">
                    {r.is_valid ? (
                      <span className="text-xs text-success">Valid</span>
                    ) : (
                      <span className="text-xs text-danger">Di luar area</span>
                    )}
                  </td>
                  {canCorrect && (
                    <td className="px-4 py-2">
                      <CorrectionForm record={r} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CorrectionForm({ record }: { record: AttendanceRecord }) {
  const [state, formAction] = useFormState<CorrectionState, FormData>(correctRecord, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="isValid" value={record.is_valid ? "false" : "true"} />
      <input
        type="text"
        name="note"
        defaultValue={record.note ?? ""}
        placeholder="Catatan"
        className="w-28 rounded border border-[color:var(--border)] px-2 py-1 text-xs"
      />
      <CorrectionButton invalidating={record.is_valid} />
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
      {state.success && <span className="text-xs text-success">{state.success}</span>}
    </form>
  );
}

function CorrectionButton({ invalidating }: { invalidating: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-[color:var(--border)] px-2 py-1 text-xs text-ink hover:bg-brand-light disabled:opacity-60"
    >
      {invalidating ? "Tandai tidak valid" : "Setujui"}
    </button>
  );
}
