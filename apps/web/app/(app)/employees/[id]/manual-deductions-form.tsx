"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { formatRupiah } from "@nexis/money";
import {
  createManualDeduction,
  deleteManualDeduction,
  type EditState,
} from "./actions";
import type { ManualDeduction } from "@/lib/manual-deductions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: EditState = {};

/**
 * Per-employee manual/absence deductions: a list of recorded one-off deductions
 * and a form to add a new one (amount + required reason + the date it applies to).
 */
export function ManualDeductionsForm({
  canEdit,
  employeeId,
  entries,
  today,
}: {
  canEdit: boolean;
  employeeId: string;
  entries: ManualDeduction[];
  today: string;
}) {
  const t = useTranslations("manualDeductions");
  const [state, action] = useFormState(createManualDeduction, initial);

  return (
    <Card className="max-w-xl p-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.success && <Alert variant="success" className="mb-4">{state.success}</Alert>}

      {entries.length > 0 && (
        <ul className="mb-5 divide-y divide-white/10 rounded-md border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{e.reason}</p>
                <p className="text-xs text-muted">{e.date ?? t("noDate")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums text-danger">−{formatRupiah(e.amount)}</span>
                {canEdit && (
                  <form action={deleteManualDeduction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="employeeId" value={employeeId} />
                    <button type="submit" className="text-xs font-medium text-muted hover:text-danger hover:underline">
                      {t("remove")}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form action={action} className="space-y-4">
          <input type="hidden" name="employeeId" value={employeeId} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="md-amount">{t("amount")}</Label>
              <Input id="md-amount" name="amount" type="number" min={0} step={1000} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="md-date">{t("date")}</Label>
              <Input id="md-date" name="date" type="date" defaultValue={today} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="md-reason">{t("reason")}</Label>
            <Input id="md-reason" name="reason" required placeholder={t("reasonPlaceholder")} />
            <p className="text-xs text-muted">{t("reasonHint")}</p>
          </div>
          <SubmitButton>{t("add")}</SubmitButton>
        </form>
      )}
    </Card>
  );
}
