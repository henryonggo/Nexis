"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateNotifications, type NotificationsState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: NotificationsState = {};

/** WhatsApp phone + opt-in. Phone persists today; opt-in is pending a DB column. */
export function NotificationsForm({
  defaultPhone,
  defaultOptIn,
}: {
  defaultPhone: string;
  defaultOptIn: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const [state, action] = useFormState(updateNotifications, initial);

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
      <p className="mb-3 text-sm text-muted">{t("description")}</p>

      {state.error && <div className="nx-error mb-3">{state.error}</div>}
      {state.ok && <div className="nx-success mb-3">{t("saved")}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="phone">{t("phone")}</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={defaultPhone}
            placeholder={t("phonePlaceholder")}
            className="nx-input"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="whatsappOptIn"
            defaultChecked={defaultOptIn}
            className="mt-0.5 accent-brand"
          />
          <span>
            {t("whatsappOptIn")}
            <span className="mt-0.5 block text-xs text-muted">{t("whatsappHint")}</span>
          </span>
        </label>

        <SubmitButton>{t("save")}</SubmitButton>
      </form>
    </div>
  );
}
