"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { generateKeyAction, type DeveloperActionState } from "./actions";
import { API_SCOPES } from "@/lib/developer-constants";
import { SubmitButton } from "@/components/submit-button";
import { SecretReveal } from "./secret-reveal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: DeveloperActionState = {};

export function KeyForm() {
  const t = useTranslations("developer.keyForm");
  const [state, action] = useFormState(generateKeyAction, initial);

  return (
    <Card className="p-8">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.secret && <SecretReveal label={t("newSecretLabel")} secret={state.secret} />}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="key-name">{t("name")}</Label>
          <Input id="key-name" name="name" placeholder={t("namePlaceholder")} />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-ink">{t("scopes")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="scopes" value={scope} className="accent-brand" />
                <code>{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
