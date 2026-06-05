"use client";

import { useFormState } from "react-dom";
import { createCycleAction, type PerfActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: PerfActionState = {};

/** Create a new review cycle (e.g. "2026 H1"). owner/admin/manager only. */
export function CycleForm() {
  const [state, action] = useFormState(createCycleAction, initial);

  return (
    <div className="nx-card">
      <h2 className="mb-1 text-lg font-semibold text-ink">Buat siklus penilaian</h2>
      <p className="mb-4 text-sm text-muted">
        Periode penilaian kinerja, mis. semester atau tahunan.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.ok && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Siklus dibuat.
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="name">
            Nama siklus
          </label>
          <input id="name" name="name" className="nx-input" placeholder="2026 Semester 1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="startDate">
              Mulai
            </label>
            <input id="startDate" name="startDate" type="date" className="nx-input" />
          </div>
          <div>
            <label className="nx-label" htmlFor="endDate">
              Selesai
            </label>
            <input id="endDate" name="endDate" type="date" className="nx-input" />
          </div>
        </div>
        <SubmitButton>Buat siklus</SubmitButton>
      </form>
    </div>
  );
}
