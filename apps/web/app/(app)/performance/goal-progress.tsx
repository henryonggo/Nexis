"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateGoalProgressAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";

const initial: PerfActionState = {};

/** Inline progress editor for one goal (manager surface). */
export function GoalProgress({ goalId, progress }: { goalId: string; progress: number }) {
  const t = useTranslations("performance.goalProgress");
  const [state, action] = useFormState(updateGoalProgressAction, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="goalId" value={goalId} />
      <Input
        type="number"
        name="progress"
        min={0}
        max={100}
        defaultValue={progress}
        className="h-8 w-20"
        aria-label={t("ariaLabel")}
      />
      <span className="text-sm text-muted">%</span>
      <SubmitButton>{t("save")}</SubmitButton>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
