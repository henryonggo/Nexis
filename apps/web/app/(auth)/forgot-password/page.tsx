"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { forgotPassword, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, action] = useFormState(forgotPassword, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Forgot password</h1>
      <p className="mb-5 text-sm text-muted">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <SubmitButton>Send reset link</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/sign-in" className="nx-link">Back to sign in</Link>
      </p>
    </div>
  );
}
