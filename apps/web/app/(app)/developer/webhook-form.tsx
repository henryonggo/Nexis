"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createWebhookAction, type DeveloperActionState } from "./actions";
import { WEBHOOK_EVENTS } from "@/lib/developer-constants";
import { SubmitButton } from "@/components/submit-button";
import { SecretReveal } from "./secret-reveal";

const initial: DeveloperActionState = {};

export function WebhookForm() {
  const t = useTranslations("developer.webhookForm");
  const [state, action] = useFormState(createWebhookAction, initial);

  return (
    <div className="nx-card">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.secret && <SecretReveal label={t("secretLabel")} secret={state.secret} />}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="webhook-url">
            {t("url")}
          </label>
          <input
            id="webhook-url"
            name="url"
            type="url"
            className="nx-input"
            placeholder="https://contoh.com/webhooks/nexis"
          />
        </div>
        <fieldset>
          <legend className="nx-label">{t("events")}</legend>
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
    </div>
  );
}
