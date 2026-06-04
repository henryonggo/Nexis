"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@nexis/types";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "../status-badge";

type Status = Database["public"]["Enums"]["pay_period_status"];

/**
 * Live payroll-run status. Subscribes to `payroll_runs` UPDATEs for this run so
 * the badge tracks the worker's draft→queued→processing→completed transitions in
 * real time, and refreshes the server component (re-fetching payroll_items, the
 * action bar, and notices) whenever the status changes. AC #2.
 */
export function RunStatusStream({
  runId,
  initialStatus,
}: {
  runId: string;
  initialStatus: Status;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [live, setLive] = useState(false);

  // Keep local state in sync if the server re-renders with a newer status.
  useEffect(() => setStatus(initialStatus), [initialStatus]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`payroll_run:${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payroll_runs", filter: `id=eq.${runId}` },
        (payload) => {
          const next = (payload.new as { status?: Status }).status;
          if (next && next !== status) {
            setStatus(next);
            router.refresh();
          }
        },
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const transient = status === "queued" || status === "processing";

  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge status={status} />
      {transient && (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-gray-300"}`} />
          {live ? "memantau…" : "menyambung…"}
        </span>
      )}
    </span>
  );
}
