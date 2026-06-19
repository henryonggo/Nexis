"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { recordAttendance, type ClockState } from "./actions";

type Kind = "clock_in" | "clock_out" | "break_start" | "break_end";

const initial: ClockState = {};

export function ClockInOut() {
  const t = useTranslations("attendance.clock");
  const [state, action] = useFormState(recordAttendance, initial);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clock(kind: Kind) {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t("noGeo"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("latitude", String(pos.coords.latitude));
        fd.set("longitude", String(pos.coords.longitude));
        startTransition(() => action(fd));
      },
      () => setGeoError(t("geoDenied")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const buttons: { kind: Kind; label: string; variant?: "outline" }[] = [
    { kind: "clock_in", label: t("clockIn") },
    { kind: "break_start", label: t("breakStart"), variant: "outline" },
    { kind: "break_end", label: t("breakEnd"), variant: "outline" },
    { kind: "clock_out", label: t("clockOut"), variant: "outline" },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-brand" />
        <h2 className="text-sm font-semibold text-ink">{t("title")}</h2>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {buttons.map((b) => (
          <Button
            key={b.kind}
            variant={b.variant}
            size="sm"
            disabled={pending}
            onClick={() => clock(b.kind)}
          >
            {b.label}
          </Button>
        ))}
      </div>
      {(geoError || state.error) && (
        <p className="mt-3 text-sm text-danger">{geoError ?? state.error}</p>
      )}
      {state.success && <p className="mt-3 text-sm text-success">{state.success}</p>}
    </Card>
  );
}
