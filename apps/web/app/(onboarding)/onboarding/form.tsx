"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createFirstCompany, joinCompanyWithCode, type OnboardingState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: OnboardingState = {};

export function OnboardingForm() {
  const t = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [state, action] = useFormState(createFirstCompany, initial);
  const [joinState, joinAction] = useFormState(joinCompanyWithCode, initial);

  return (
    <Card className="w-full max-w-md p-8">
      <div className="mb-6 flex rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-all ${
            mode === "create"
              ? "bg-background text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {t("title")}
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-all ${
            mode === "join"
              ? "bg-background text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {t("joinTitle")}
        </button>
      </div>

      {mode === "create" ? (
        <>
          <h2 className="mb-1 text-xl font-bold text-ink">{t("title")}</h2>
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
        </>
      ) : (
        <>
          <h2 className="mb-1 text-xl font-bold text-ink">{t("joinTitle")}</h2>
          <p className="mb-5 text-sm text-muted">{t("joinSubtitle")}</p>

          {joinState.error && <Alert variant="destructive" className="mb-4">{joinState.error}</Alert>}

          <form action={joinAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">{t("codeLabel")}</Label>
              <Input id="code" name="code" placeholder={t("codePlaceholder")} required />
            </div>
            <SubmitButton>{t("joinSubmit")}</SubmitButton>
          </form>
        </>
      )}
    </Card>
  );
}
