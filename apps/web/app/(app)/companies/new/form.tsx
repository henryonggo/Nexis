"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createCompany, type CreateCompanyState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: CreateCompanyState = {};

export function CreateCompanyForm() {
  const t = useTranslations("companies");
  const tco = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const [state, action] = useFormState(createCompany, initial);

  return (
    <Card className="max-w-md p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("newTitle")}</h1>
      <p className="mb-5 text-sm text-muted">{t("newSubtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{tco("nameLabel")}</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="industry">
            {tco("industryLabel")} <span className="text-muted">{tc("optional")}</span>
          </Label>
          <Input id="industry" name="industry" placeholder={tco("industryPlaceholder")} />
        </div>
        <SubmitButton>{tco("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
