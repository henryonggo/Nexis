"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { signUp, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: ActionState = {};

export default function SignUpPage() {
  const [state, action] = useFormState(signUp, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Buat akun</h1>
      <p className="mb-5 text-sm text-muted">Mulai gratis — 5 karyawan pertama tanpa biaya.</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="fullName">Nama lengkap</label>
          <input id="fullName" name="fullName" className="nx-input" autoComplete="name" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="password">Kata sandi</label>
          <input id="password" name="password" type="password" className="nx-input" autoComplete="new-password" required />
          <p className="mt-1 text-xs text-muted">Minimal 8 karakter, 1 huruf besar, 1 angka.</p>
        </div>
        <SubmitButton>Daftar</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Sudah punya akun? <Link href="/sign-in" className="nx-link">Masuk</Link>
      </p>
    </div>
  );
}
