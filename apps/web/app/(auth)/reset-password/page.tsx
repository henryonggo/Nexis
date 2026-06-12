"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { resetPassword, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: ActionState = {};

export default function ResetPasswordPage() {
  const t = useTranslations("auth.reset");
  const tc = useTranslations("common");
  const [state, action] = useFormState(resetPassword, initial);

  return (
    <Card className="w-full max-w-md p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("newPassword")}</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
          <p className="text-xs text-muted">{tc("passwordHint")}</p>
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>
    </Card>
  );
}
