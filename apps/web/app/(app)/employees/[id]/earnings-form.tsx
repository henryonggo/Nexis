"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateEmployeeEarnings, type EditState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Input, fieldClasses } from "@/components/ui/input";

export type EarningGroupOption = { id: string; name: string };
export type EarningCustomOption = {
  id: string;
  name: string;
  calc: "fixed" | "percent";
  amount: number | null;
};

const initial: EditState = {};

/**
 * Per-employee earnings (allowances) picker: assign a reusable group, or choose
 * earnings manually. In manual mode a fixed-amount earning can be overridden for
 * this one person (the spec's "adjusted per employee"); leaving the override
 * blank uses the type's default amount.
 */
export function EmployeeEarningsForm({
  canEdit,
  employeeId,
  groups,
  customs,
  current,
}: {
  canEdit: boolean;
  employeeId: string;
  groups: EarningGroupOption[];
  customs: EarningCustomOption[];
  current: {
    source: "group" | "manual" | "none";
    groupId: string | null;
    /** Manual selections: custom type id → amount override (null = default). */
    selected: Record<string, number | null>;
  };
}) {
  const t = useTranslations("earnings");
  const [state, action] = useFormState(updateEmployeeEarnings, initial);

  const [mode, setMode] = useState<"group" | "manual">(
    current.source === "group" ? "group" : "manual",
  );
  const [groupId, setGroupId] = useState(current.groupId ?? groups[0]?.id ?? "");
  const [checked, setChecked] = useState<Set<string>>(
    new Set(Object.keys(current.selected)),
  );

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Card className="max-w-xl p-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t("employee.title")}</h2>
        <p className="text-sm text-muted">{t("employee.subtitle")}</p>
      </div>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.success && <Alert variant="success" className="mb-4">{state.success}</Alert>}

      <form action={action} className="space-y-5">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="mode" value={mode} />

        {/* Mode picker */}
        <div className="flex gap-4">
          {(["group", "manual"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="modePicker"
                checked={mode === m}
                onChange={() => setMode(m)}
                disabled={!canEdit}
                className="h-4 w-4 accent-brand"
              />
              {t(`employee.mode.${m}`)}
            </label>
          ))}
        </div>

        {mode === "group" ? (
          <div className="space-y-1.5">
            <Label htmlFor="earningGroupId">{t("employee.group")}</Label>
            {groups.length === 0 ? (
              <p className="text-sm text-muted">{t("employee.noGroups")}</p>
            ) : (
              <select
                id="earningGroupId"
                name="groupId"
                className={fieldClasses}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={!canEdit}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">{t("group.custom")}</legend>
            {customs.length === 0 ? (
              <p className="text-xs text-muted">{t("employee.noCustom")}</p>
            ) : (
              <div className="divide-y divide-white/10 rounded-md border border-border">
                {customs.map((c) => {
                  const on = checked.has(c.id);
                  return (
                    <div key={c.id} className="space-y-2 p-3">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink">{c.name}</span>
                        <input
                          type="checkbox"
                          name="custom"
                          value={c.id}
                          checked={on}
                          onChange={(e) => toggle(c.id, e.target.checked)}
                          disabled={!canEdit}
                          className="h-4 w-4 shrink-0 accent-brand"
                        />
                      </label>
                      {/* Per-person amount override, only for fixed-amount earnings. */}
                      {on && c.calc === "fixed" && (
                        <div className="flex items-center gap-2 pl-1">
                          <Label htmlFor={`ov-${c.id}`} className="text-xs text-muted">
                            {t("employee.override")}
                          </Label>
                          <Input
                            id={`ov-${c.id}`}
                            name={`override:${c.id}`}
                            type="number"
                            min={0}
                            step={1000}
                            defaultValue={current.selected[c.id] ?? c.amount ?? 0}
                            disabled={!canEdit}
                            className="max-w-[10rem]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}

        {canEdit && <SubmitButton>{t("employee.save")}</SubmitButton>}
      </form>
    </Card>
  );
}
