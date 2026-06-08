"use client";

import { useFormState } from "react-dom";
import { resetPassword, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

const initial: ActionState = {};

export default function ResetPasswordPage() {
  const [state, action] = useFormState(resetPassword, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Reset password</h1>
      <p className="mb-5 text-sm text-muted">Enter a new password for your account.</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="password">New password</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
          <p className="mt-1 text-xs text-muted">At least 8 characters, 1 uppercase letter, 1 number.</p>
        </div>
        <SubmitButton>Save password</SubmitButton>
      </form>
    </div>
  );
}
