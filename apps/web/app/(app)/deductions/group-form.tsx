"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createGroup, updateGroup, type DeductionState } from "./actions";
import {
  STATUTORY_DEDUCTIONS,
  type CustomDeductionType,
  type DeductionGroup,
} from "@/lib/deductions";
import { SubmitButton } from "@/components/submit-button";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: DeductionState = {};

/** Create (no `group`) or edit a reusable deduction group template. */
export function GroupForm({
  group,
  customs,
}: {
  group?: DeductionGroup;
  customs: CustomDeductionType[];
}) {
  const t = useTranslations("deductions");
  const [state, action] = useFormState(group ? updateGroup : createGroup, initial);
  const suffix = group?.id ?? "new";

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.ok && <Alert variant="success">{t("saved")}</Alert>}
      {group && <input type="hidden" name="id" value={group.id} />}

      <div className="space-y-1.5">
        <Label htmlFor={`gname-${suffix}`}>{t("group.name")}</Label>
        <Input
          id={`gname-${suffix}`}
          name="name"
          defaultValue={group?.name ?? ""}
          required
          placeholder={t("group.namePlaceholder")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`gdesc-${suffix}`}>{t("group.description")}</Label>
        <Input id={`gdesc-${suffix}`} name="description" defaultValue={group?.description ?? ""} />
      </div>

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
                defaultChecked={group?.statutory.includes(d.code) ?? false}
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
                  defaultChecked={group?.customTypeIds.includes(c.id) ?? false}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <SubmitButton>{group ? t("group.save") : t("group.create")}</SubmitButton>
    </form>
  );
}
