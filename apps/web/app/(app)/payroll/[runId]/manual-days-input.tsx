"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { updateRunManualDays } from "../actions";
import { Input } from "@/components/ui/input";
import type { UpdateManualDaysState } from "../actions";

interface ManualDaysInputProps {
  runId: string;
  employeeId: string;
  currentDays: number;
  isDraft: boolean;
}

/**
 * Editable input for manually-entered days on a daily/mixed employee.
 * Only shown for draft runs. Submits to the server action which calls
 * set_run_manual_days RPC. On change, updates the preview with new totals.
 */
function ManualDaysForm({
  runId,
  employeeId,
  currentDays,
  action,
}: Omit<ManualDaysInputProps, "isDraft"> & { action: (formData: FormData) => void }) {
  const t = useTranslations("payroll.detail");
  const { pending } = useFormStatus();

  return (
    <form action={action} className="flex items-end gap-1">
      <div className="flex-1">
        <label className="block text-[10px] font-semibold text-muted mb-0.5">
          {t("manualDaysLabel")}
        </label>
        <Input
          type="number"
          name="days"
          min="0"
          max="31"
          defaultValue={currentDays}
          placeholder={t("manualDaysPlaceholder")}
          disabled={pending}
          className="h-8 text-xs"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-2 py-1 h-8 text-xs font-semibold bg-brand text-white rounded hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "…" : "Simpan"}
      </button>
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="employeeId" value={employeeId} />
    </form>
  );
}

const initialState: UpdateManualDaysState = {};

export function ManualDaysInput({
  runId,
  employeeId,
  currentDays,
  isDraft,
}: ManualDaysInputProps) {
  const t = useTranslations("payroll.detail");
  const [state, action] = useFormState(updateRunManualDays, initialState);

  if (!isDraft) {
    // For non-draft runs, show as read-only badge
    return (
      <span className="inline-flex items-center rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-semibold text-brand-dark border border-brand/20">
        {t("daysWorked", { days: currentDays })}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ManualDaysForm runId={runId} employeeId={employeeId} currentDays={currentDays} action={action} />
      {state.error && (
        <p className="text-[10px] text-destructive">{state.error}</p>
      )}
    </div>
  );
}
