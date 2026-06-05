"use client";

import { useFormState } from "react-dom";
import { updateGoalProgressAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: PerfActionState = {};

/** Inline progress editor for one goal (manager surface). */
export function GoalProgress({ goalId, progress }: { goalId: string; progress: number }) {
  const [state, action] = useFormState(updateGoalProgressAction, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="goalId" value={goalId} />
      <input
        type="number"
        name="progress"
        min={0}
        max={100}
        defaultValue={progress}
        className="w-20 rounded-md border border-[color:var(--border)] px-2 py-1 text-sm"
        aria-label="Progres (%)"
      />
      <span className="text-sm text-muted">%</span>
      <SubmitButton>Simpan</SubmitButton>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
