"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createCycleAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: PerfActionState = {};

/** Create a new review cycle (e.g. "2026 H1"). owner/admin/manager only. */
export function CycleForm() {
  const t = useTranslations("performance.cycleForm");
  const [state, action] = useFormState(createCycleAction, initial);

  return (
    <Card className="p-8">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.ok && <Alert variant="success" className="mb-4">{t("created")}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" placeholder={t("namePlaceholder")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="startDate">{t("start")}</Label>
            <Input id="startDate" name="startDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endDate">{t("end")}</Label>
            <Input id="endDate" name="endDate" type="date" />
          </div>
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
