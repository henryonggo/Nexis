"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateEmployeeAccess, type AccessState } from "./actions";
import type { EmployeeAccess } from "@/lib/access";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

type PageFlag = "attendance" | "leave" | "claims" | "salary";

/** Surfaces grouped so owner/admin can reason about access by area, not flag-by-flag. */
const GROUPS: { key: string; items: PageFlag[] }[] = [
  { key: "operations", items: ["attendance", "leave", "claims"] },
  { key: "compensation", items: ["salary"] },
];

/** Dashboard widget switches. `field` is the form field; `flag` the default source. */
const DASH_ITEMS: { field: string; flag: "dashPay" | "dashLeave" | "dashAttendance" }[] = [
  { field: "dash_pay", flag: "dashPay" },
  { field: "dash_leave", flag: "dashLeave" },
  { field: "dash_attendance", flag: "dashAttendance" },
];

const initial: AccessState = {};

export function AccessForm({ defaults }: { defaults: EmployeeAccess }) {
  const t = useTranslations("access");
  const [state, action] = useFormState(updateEmployeeAccess, initial);

  return (
    <form action={action} className="space-y-6">
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.ok && <Alert variant="success">{t("saved")}</Alert>}

      {GROUPS.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t(`groups.${g.key}`)}
          </h2>
          <Card className="divide-y divide-white/10 p-0">
            {g.items.map((item) => (
              <label key={item} className="flex items-start justify-between gap-3 p-4">
                <span className="text-sm text-ink">
                  {t(`items.${item}.label`)}
                  <span className="mt-0.5 block text-xs text-muted">
                    {t(`items.${item}.hint`)}
                  </span>
                </span>
                <input
                  type="checkbox"
                  name={item}
                  defaultChecked={defaults[item]}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                />
              </label>
            ))}
          </Card>
        </section>
      ))}

      {/* Dashboard widgets — each still requires its area access above. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("groups.dashboard")}
        </h2>
        <Card className="divide-y divide-white/10 p-0">
          {DASH_ITEMS.map((item) => (
            <label key={item.field} className="flex items-start justify-between gap-3 p-4">
              <span className="text-sm text-ink">
                {t(`items.${item.field}.label`)}
                <span className="mt-0.5 block text-xs text-muted">
                  {t(`items.${item.field}.hint`)}
                </span>
              </span>
              <input
                type="checkbox"
                name={item.field}
                defaultChecked={defaults[item.flag]}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
            </label>
          ))}
        </Card>
      </section>

      {/* Employee navigation layout. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("groups.navigation")}
        </h2>
        <Card className="divide-y divide-white/10 p-0">
          {(["flat", "pillars"] as const).map((style) => (
            <label key={style} className="flex items-start justify-between gap-3 p-4">
              <span className="text-sm text-ink">
                {t(`navStyle.${style}.label`)}
                <span className="mt-0.5 block text-xs text-muted">
                  {t(`navStyle.${style}.hint`)}
                </span>
              </span>
              <input
                type="radio"
                name="nav_style"
                value={style}
                defaultChecked={defaults.navStyle === style}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
            </label>
          ))}
        </Card>
      </section>

      <SubmitButton>{t("save")}</SubmitButton>
    </form>
  );
}
