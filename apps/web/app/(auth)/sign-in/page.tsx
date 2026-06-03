"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn, type ActionState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: ActionState = {};

function SignInForm() {
  const [state, action] = useFormState(signIn, initial);
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/dashboard";
  const justReset = params.get("reset") === "1";

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Masuk</h1>
      <p className="mb-5 text-sm text-muted">Selamat datang kembali.</p>

      {justReset && <div className="nx-success mb-4">Kata sandi berhasil diubah. Silakan masuk.</div>}
      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div>
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="nx-label" htmlFor="password">Kata sandi</label>
            <Link href="/forgot-password" className="nx-link text-xs">Lupa kata sandi?</Link>
          </div>
          <input id="password" name="password" type="password" className="nx-input" autoComplete="current-password" required />
        </div>
        <SubmitButton>Masuk</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Belum punya akun? <Link href="/sign-up" className="nx-link">Daftar</Link>
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
