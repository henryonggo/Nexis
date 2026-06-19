"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { fieldClasses } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestLeave, type DecisionState } from "./actions";

const initial: DecisionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {label}
    </Button>
  );
}

export function LeaveRequestForm({ leaveTypes }: { leaveTypes: { id: string; name: string }[] }) {
  const t = useTranslations("leave.request");
  const [state, action] = useFormState(requestLeave, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{t("title")}</h2>
      <form ref={formRef} action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted">{t("type")}</span>
          <select name="leaveTypeId" required defaultValue="" className={fieldClasses}>
            <option value="" disabled>
              {t("typePlaceholder")}
            </option>
            {leaveTypes.map((lt) => (
              <option key={lt.id} value={lt.id}>
                {lt.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted">{t("start")}</span>
          <input type="date" name="startDate" required className={fieldClasses} />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted">{t("end")}</span>
          <input type="date" name="endDate" required className={fieldClasses} />
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="halfDay" className="h-4 w-4 rounded border-border" />
          <span className="text-muted">{t("halfDay")}</span>
        </label>

        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted">{t("reason")}</span>
          <textarea name="reason" rows={2} maxLength={500} className={`${fieldClasses} h-auto py-2`} />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <SubmitButton label={t("submit")} />
          {state.error && <span className="text-sm text-danger">{state.error}</span>}
          {state.ok && <span className="text-sm text-success">{t("submitted")}</span>}
        </div>
      </form>
    </Card>
  );
}
