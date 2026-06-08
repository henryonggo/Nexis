"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

const initial: ActionState = {};

function SignInForm() {
  const [state, action] = useFormState(signIn, initial);
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/dashboard";
  const justReset = params.get("reset") === "1";
  const timedOut = params.get("timeout") === "1";
  const deactivated = params.get("deactivated") === "1";

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Sign in</h1>
      <p className="mb-5 text-sm text-muted">Welcome back.</p>

      {justReset && <div className="nx-success mb-4">Password updated. Please sign in.</div>}
      {timedOut && <div className="nx-success mb-4">You were signed out due to inactivity.</div>}
      {deactivated && <div className="nx-success mb-4">Your account has been deactivated.</div>}
      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div>
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="nx-label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="nx-link text-xs">Forgot password?</Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </div>
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Don&apos;t have an account? <Link href="/sign-up" className="nx-link">Sign up</Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
