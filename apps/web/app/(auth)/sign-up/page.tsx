"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signUp, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

const initial: ActionState = {};

export default function SignUpPage() {
  const t = useTranslations("auth.signUp");
  const tc = useTranslations("common");
  const [state, action] = useFormState(signUp, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="fullName">{t("fullName")}</label>
          <input id="fullName" name="fullName" className="nx-input" autoComplete="name" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="email">{tc("email")}</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="password">{tc("password")}</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
          <p className="mt-1 text-xs text-muted">{tc("passwordHint")}</p>
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("haveAccount")} <Link href="/sign-in" className="nx-link">{t("signInLink")}</Link>
      </p>
    </div>
  );
}
