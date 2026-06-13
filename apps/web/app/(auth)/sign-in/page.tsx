"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { signIn, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: ActionState = {};

function SignInForm() {
  const t = useTranslations("auth.signIn");
  const tc = useTranslations("common");
  const [state, action] = useFormState(signIn, initial);
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/dashboard";
  const justReset = params.get("reset") === "1";
  const timedOut = params.get("timeout") === "1";
  const deactivated = params.get("deactivated") === "1";

  return (
    <Card className="w-full max-w-md p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("welcome")}</p>

      {justReset && <Alert variant="success" className="mb-4">{t("resetDone")}</Alert>}
      {timedOut && <Alert variant="success" className="mb-4">{t("timedOut")}</Alert>}
      {deactivated && <Alert variant="success" className="mb-4">{t("deactivated")}</Alert>}
      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}

      <form action={action} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div className="space-y-1.5">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{tc("password")}</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
              {t("forgotLink")}
            </Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </div>
        <SubmitButton>{t("submit")}</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("noAccount")}{" "}
        <Link
          href={`/sign-up${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-medium text-brand hover:underline"
        >
          {t("signUpLink")}
        </Link>
      </p>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
