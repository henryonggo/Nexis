"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateEmployeeDeductions, type EditState } from "./actions";
import { STATUTORY_DEDUCTIONS, type StatutoryCode } from "@/lib/deductions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { fieldClasses } from "@/components/ui/input";

export type GroupOption = { id: string; name: string; statutory: StatutoryCode[] };
export type CustomOption = { id: string; name: string };

const initial: EditState = {};

export function EmployeeDeductionsForm({
  canEdit,
  employeeId,
  groups,
  customs,
  current,
}: {
  canEdit: boolean;
  employeeId: string;
  groups: GroupOption[];
  customs: CustomOption[];
  current: {
    source: "group" | "manual" | "none";
    groupId: string | null;
    statutory: StatutoryCode[];
    customIds: string[];
  };
}) {
  const t = useTranslations("deductions");
  const [state, action] = useFormState(updateEmployeeDeductions, initial);

  const [mode, setMode] = useState<"group" | "manual">(
    current.source === "group" ? "group" : "manual",
  );
  const [groupId, setGroupId] = useState(current.groupId ?? groups[0]?.id ?? "");
  const [statutory, setStatutory] = useState<Set<StatutoryCode>>(new Set(current.statutory));

  // Mandatory statutory deductions currently switched off → compliance warning.
  const missing = useMemo(() => {
    const selected =
      mode === "group"
        ? new Set(groups.find((g) => g.id === groupId)?.statutory ?? [])
        : statutory;
    return STATUTORY_DEDUCTIONS.filter((d) => !selected.has(d.code));
  }, [mode, groupId, statutory, groups]);

  function toggle(code: StatutoryCode, on: boolean) {
    setStatutory((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
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

      {missing.length > 0 && (
        <Alert variant="warning" className="mb-4">
          {t("employee.complianceWarning", {
            list: missing.map((d) => t(`statutory.${d.labelKey}`)).join(", "),
          })}
        </Alert>
      )}

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
            <Label htmlFor="groupId">{t("employee.group")}</Label>
            {groups.length === 0 ? (
              <p className="text-sm text-muted">{t("employee.noGroups")}</p>
            ) : (
              <select
                id="groupId"
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
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t("group.statutory")}</legend>
              <div className="divide-y divide-white/10 rounded-md border border-border">
                {STATUTORY_DEDUCTIONS.map((d) => (
                  <label key={d.code} className="flex items-center justify-between gap-3 p-3">
                    <span className="text-sm text-ink">{t(`statutory.${d.labelKey}`)}</span>
                    <input
                      type="checkbox"
                      name="statutory"
                      value={d.code}
                      checked={statutory.has(d.code)}
                      onChange={(e) => toggle(d.code, e.target.checked)}
                      disabled={!canEdit}
                      className="h-4 w-4 shrink-0 accent-brand"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t("group.custom")}</legend>
              {customs.length === 0 ? (
                <p className="text-xs text-muted">{t("group.noCustom")}</p>
              ) : (
                <div className="divide-y divide-white/10 rounded-md border border-border">
                  {customs.map((c) => (
                    <label key={c.id} className="flex items-center justify-between gap-3 p-3">
                      <span className="text-sm text-ink">{c.name}</span>
                      <input
                        type="checkbox"
                        name="custom"
                        value={c.id}
                        defaultChecked={current.customIds.includes(c.id)}
                        disabled={!canEdit}
                        className="h-4 w-4 shrink-0 accent-brand"
                      />
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        )}

        {canEdit && <SubmitButton>{t("employee.save")}</SubmitButton>}
      </form>
    </Card>
  );
}
