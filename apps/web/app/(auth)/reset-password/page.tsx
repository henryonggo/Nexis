"use client";

import { useFormState } from "react-dom";
import { resetPassword, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: ActionState = {};

export default function ResetPasswordPage() {
  const [state, action] = useFormState(resetPassword, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Atur kata sandi baru</h1>
      <p className="mb-5 text-sm text-muted">Masukkan kata sandi baru untuk akun Anda.</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="password">Kata sandi baru</label>
          <input id="password" name="password" type="password" className="nx-input" autoComplete="new-password" required />
          <p className="mt-1 text-xs text-muted">Minimal 8 karakter, 1 huruf besar, 1 angka.</p>
        </div>
        <SubmitButton>Simpan kata sandi</SubmitButton>
      </form>
    </div>
  );
}
