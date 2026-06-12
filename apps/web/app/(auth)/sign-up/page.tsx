"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signUp, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: ActionState = {};

export default function SignUpPage() {
  const t = useTranslations("auth.signUp");
  const tc = useTranslations("common");
  const [state, action] = useFormState(signUp, initial);

  return (
    <Card className="w-full max-w-md p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}
      {state.success && <Alert variant="success" className="mb-4">{state.success}</Alert>}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{tc("password")}</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
          <p className="text-xs text-muted">{tc("passwordHint")}</p>
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/sign-in" className="font-medium text-brand hover:underline">
          {t("signInLink")}
        </Link>
      </p>
    </Card>
  );
}
