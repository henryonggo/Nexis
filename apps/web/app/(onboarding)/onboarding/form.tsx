"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createFirstCompany, type OnboardingState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: OnboardingState = {};

export function OnboardingForm() {
  const t = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const [state, action] = useFormState(createFirstCompany, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="name">{t("nameLabel")}</label>
          <input id="name" name="name" className="nx-input" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="industry">
            {t("industryLabel")} <span className="text-muted">{tc("optional")}</span>
          </label>
          <input id="industry" name="industry" className="nx-input" placeholder={t("industryPlaceholder")} />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </div>
  );
}
