"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { forgotPassword, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: ActionState = {};

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  const tc = useTranslations("common");
  const [state, action] = useFormState(forgotPassword, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="email">{tc("email")}</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/sign-in" className="nx-link">{t("backToSignIn")}</Link>
      </p>
    </div>
  );
}
