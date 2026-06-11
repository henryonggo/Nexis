"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createCompany, type CreateCompanyState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: CreateCompanyState = {};

export function CreateCompanyForm() {
  const t = useTranslations("companies");
  const tco = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const [state, action] = useFormState(createCompany, initial);

  return (
    <div className="nx-card max-w-md">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("newTitle")}</h1>
      <p className="mb-5 text-sm text-muted">{t("newSubtitle")}</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="name">{tco("nameLabel")}</label>
          <input id="name" name="name" className="nx-input" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="industry">
            {tco("industryLabel")} <span className="text-muted">{tc("optional")}</span>
          </label>
          <input id="industry" name="industry" className="nx-input" placeholder={tco("industryPlaceholder")} />
        </div>
        <SubmitButton>{tco("submit")}</SubmitButton>
      </form>
    </div>
  );
}
