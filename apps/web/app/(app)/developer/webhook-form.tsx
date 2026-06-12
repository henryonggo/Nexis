"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createWebhookAction, type DeveloperActionState } from "./actions";
import { WEBHOOK_EVENTS } from "@/lib/developer-constants";
import { SubmitButton } from "@/components/submit-button";
import { SecretReveal } from "./secret-reveal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: DeveloperActionState = {};

export function WebhookForm() {
  const t = useTranslations("developer.webhookForm");
  const [state, action] = useFormState(createWebhookAction, initial);

  return (
    <Card className="p-8">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.secret && <SecretReveal label={t("secretLabel")} secret={state.secret} />}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">{t("url")}</Label>
          <Input
            id="webhook-url"
            name="url"
            type="url"
            placeholder="https://contoh.com/webhooks/nexis"
          />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-ink">{t("events")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="events" value={event} className="accent-brand" />
                <code>{event}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
