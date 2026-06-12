"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateNotifications, type NotificationsState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

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
    <Card className="p-4">
      <p className="mb-3 text-sm text-muted">{t("description")}</p>

      {state.error && <Alert variant="destructive" className="mb-3">{state.error}</Alert>}
      {state.ok && <Alert variant="success" className="mb-3">{t("saved")}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={defaultPhone}
            placeholder={t("phonePlaceholder")}
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
    </Card>
  );
}
