"use client";

import { useFormState } from "react-dom";
import { generateKeyAction, type DeveloperActionState } from "./actions";
import { API_SCOPES } from "@/lib/developer-constants";
import { SubmitButton } from "@/components/submit-button";
import { SecretReveal } from "./secret-reveal";

const initial: DeveloperActionState = {};

export function KeyForm() {
  const [state, action] = useFormState(generateKeyAction, initial);

  return (
    <div className="nx-card">
      <h2 className="mb-1 text-lg font-semibold text-ink">Buat API key</h2>
      <p className="mb-4 text-sm text-muted">
        Kunci dipakai sebagai bearer token di header <code>Authorization</code> Public API.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.secret && <SecretReveal label="API key baru" secret={state.secret} />}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="key-name">
            Nama kunci
          </label>
          <input id="key-name" name="name" className="nx-input" placeholder="mis. Integrasi HRIS" />
        </div>
        <fieldset>
          <legend className="nx-label">Scope</legend>
          <div className="grid grid-cols-2 gap-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="scopes" value={scope} className="accent-brand" />
                <code>{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <SubmitButton>Buat kunci</SubmitButton>
      </form>
    </div>
  );
}
