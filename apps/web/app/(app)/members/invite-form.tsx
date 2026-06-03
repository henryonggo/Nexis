"use client";

import { useFormState } from "react-dom";
import { inviteMember, type MemberState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: MemberState = {};

export function InviteForm() {
  const [state, action] = useFormState(inviteMember, initial);

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink">Undang anggota</h2>

      {state.error && <div className="nx-error mb-3">{state.error}</div>}
      {state.success && <div className="nx-success mb-3">{state.success}</div>}
      {state.inviteUrl && (
        <div className="mb-3 rounded-md bg-brand-light px-3 py-2 text-xs text-brand-dark">
          Bagikan tautan undangan ini:
          <br />
          <code className="break-all">{state.inviteUrl}</code>
        </div>
      )}

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" required />
        </div>
        <div className="sm:w-44">
          <label className="nx-label" htmlFor="role">Peran</label>
          <select id="role" name="role" className="nx-input" defaultValue="employee">
            <option value="admin">Admin</option>
            <option value="manager">Manajer</option>
            <option value="employee">Karyawan</option>
          </select>
        </div>
        <div className="sm:w-36">
          <SubmitButton>Kirim undangan</SubmitButton>
        </div>
      </form>
    </div>
  );
}
