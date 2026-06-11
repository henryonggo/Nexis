"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { resetPassword, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

const initial: ActionState = {};

export default function ResetPasswordPage() {
  const t = useTranslations("auth.reset");
  const tc = useTranslations("common");
  const [state, action] = useFormState(resetPassword, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="password">{t("newPassword")}</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
          <p className="mt-1 text-xs text-muted">{tc("passwordHint")}</p>
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </div>
  );
}
