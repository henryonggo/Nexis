"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import {
  createEarningGroup,
  updateEarningGroup,
  type EarningState,
} from "./actions";
import type { CustomEarningType, EarningGroup } from "@/lib/earnings";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: EarningState = {};

/** Create (no `group`) or edit a reusable earning (tunjangan) group template. */
export function GroupForm({
  group,
  customs,
}: {
  group?: EarningGroup;
  customs: CustomEarningType[];
}) {
  const t = useTranslations("earnings");
  const [state, action] = useFormState(group ? updateEarningGroup : createEarningGroup, initial);
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
