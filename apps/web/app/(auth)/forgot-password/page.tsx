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
      <h1 className="mb-1 text-xl font-bold text-ink">Lupa kata sandi</h1>
      <p className="mb-5 text-sm text-muted">
        Masukkan email Anda dan kami akan mengirim tautan untuk mengatur ulang kata sandi.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <SubmitButton>Kirim tautan reset</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/sign-in" className="nx-link">Kembali ke halaman masuk</Link>
      </p>
    </div>
  );
}
