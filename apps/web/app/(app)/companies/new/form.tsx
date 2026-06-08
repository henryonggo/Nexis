"use client";

import { useFormState } from "react-dom";
import { createCompany, type CreateCompanyState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: CreateCompanyState = {};

export function CreateCompanyForm() {
  const [state, action] = useFormState(createCompany, initial);

  return (
    <div className="nx-card max-w-md">
      <h1 className="mb-1 text-xl font-bold text-ink">Tambah perusahaan</h1>
      <p className="mb-5 text-sm text-muted">
        Buat perusahaan baru. Anda akan menjadi pemiliknya dan langsung beralih ke sana.
      </p>

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
