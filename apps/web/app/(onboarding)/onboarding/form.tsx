"use client";

import { useFormState } from "react-dom";
import { createFirstCompany, type OnboardingState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: OnboardingState = {};

export function OnboardingForm() {
  const [state, action] = useFormState(createFirstCompany, initial);

  return (
    <div className="nx-card">
      <h1 className="mb-1 text-xl font-bold text-ink">Detail perusahaan</h1>
      <p className="mb-5 text-sm text-muted">Hanya butuh nama untuk memulai.</p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="name">Nama perusahaan</label>
          <input id="name" name="name" className="nx-input" required />
        </div>
        <div>
          <label className="nx-label" htmlFor="industry">
            Industri <span className="text-muted">(opsional)</span>
          </label>
          <input id="industry" name="industry" className="nx-input" placeholder="mis. Ritel, Teknologi" />
        </div>
        <SubmitButton>Buat perusahaan</SubmitButton>
      </form>
    </div>
  );
}
