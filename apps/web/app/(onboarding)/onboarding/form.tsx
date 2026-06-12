"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createFirstCompany, type OnboardingState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: OnboardingState = {};

export function OnboardingForm() {
  const t = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const [state, action] = useFormState(createFirstCompany, initial);

  return (
    <Card className="w-full max-w-md p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("nameLabel")}</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="industry">
            {t("industryLabel")} <span className="text-muted">{tc("optional")}</span>
          </Label>
          <Input id="industry" name="industry" placeholder={t("industryPlaceholder")} />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
