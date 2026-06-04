"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { createDraftRun, type RunActionState } from "../actions";
import { MONTH_NAMES_ID } from "@/lib/payroll-format";
import { SubmitButton } from "@/components/submit-button";

const initial: RunActionState = {};

export function NewRunForm({
  defaultYear,
  defaultMonth,
}: {
  defaultYear: number;
  defaultMonth: number;
}) {
  const [state, action] = useFormState(createDraftRun, initial);
  const years = [defaultYear + 1, defaultYear, defaultYear - 1, defaultYear - 2];

  return (
    <div className="nx-card max-w-lg">
      <h1 className="mb-1 text-xl font-bold text-ink">Jalankan payroll</h1>
      <p className="mb-5 text-sm text-muted">
        Pilih periode dan jenis run. Anda akan meninjau rincian per karyawan sebelum menyetujui.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="month">Bulan</label>
            <select id="month" name="month" defaultValue={defaultMonth} className="nx-input">
              {MONTH_NAMES_ID.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="nx-label" htmlFor="year">Tahun</label>
            <select id="year" name="year" defaultValue={defaultYear} className="nx-input">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="nx-label" htmlFor="runType">Jenis run</label>
          <select id="runType" name="runType" defaultValue="monthly" className="nx-input">
            <option value="monthly">Gaji bulanan</option>
            <option value="thr">THR (Tunjangan Hari Raya)</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <SubmitButton>Buat draf run</SubmitButton>
          <Link href="/payroll" className="text-sm text-muted hover:underline">Batal</Link>
        </div>
      </form>
    </div>
  );
}
