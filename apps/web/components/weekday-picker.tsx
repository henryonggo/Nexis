"use client";

import { useTranslations } from "next-intl";
import { WEEKDAYS } from "@/lib/work-schedule";

/**
 * Seven Mon–Sun checkboxes for an expected work schedule. Each checked day
 * submits its ISO weekday number under `name` (default "workDays"). Uncontrolled:
 * `defaultSelected` seeds the initial state and the form reads the boxes directly.
 */
export function WeekdayPicker({
  name = "workDays",
  defaultSelected,
  disabled = false,
}: {
  name?: string;
  defaultSelected: number[];
  disabled?: boolean;
}) {
  const t = useTranslations("weekdays");
  const selected = new Set(defaultSelected);

  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d) => (
        <label
          key={d.iso}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-light has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
        >
          <input
            type="checkbox"
            name={name}
            value={d.iso}
            defaultChecked={selected.has(d.iso)}
            disabled={disabled}
            className="h-3.5 w-3.5 accent-brand"
          />
          {t(d.key)}
        </label>
      ))}
    </div>
  );
}
