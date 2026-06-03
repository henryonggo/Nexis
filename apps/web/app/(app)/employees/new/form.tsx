"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createEmployee, type EmployeeState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initial: EmployeeState = {};

export function NewEmployeeForm() {
  const [state, action] = useFormState(createEmployee, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      const t = setTimeout(() => router.push("/employees"), 600);
      return () => clearTimeout(t);
    }
  }, [state.success, router]);

  return (
    <div className="nx-card max-w-xl">
      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.success && <div className="nx-success mb-4">{state.success} Mengalihkan…</div>}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="fullName">Nama lengkap *</label>
          <input id="fullName" name="fullName" className="nx-input" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="employeeNo">Nomor karyawan</label>
            <input id="employeeNo" name="employeeNo" className="nx-input" />
          </div>
          <div>
            <label className="nx-label" htmlFor="employmentType">Tipe</label>
            <select id="employmentType" name="employmentType" className="nx-input" defaultValue="permanent">
              <option value="permanent">Tetap</option>
              <option value="contract">Kontrak</option>
              <option value="intern">Magang</option>
              <option value="daily">Harian</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="nx-label" htmlFor="position">Posisi</label>
            <input id="position" name="position" className="nx-input" />
          </div>
          <div>
            <label className="nx-label" htmlFor="department">Departemen</label>
            <input id="department" name="department" className="nx-input" />
          </div>
        </div>
        <div>
          <label className="nx-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="nx-input" />
        </div>
        <div>
          <label className="nx-label" htmlFor="baseSalary">Gaji pokok (Rp / bulan)</label>
          <input id="baseSalary" name="baseSalary" type="number" min={0} step={1000} className="nx-input" defaultValue={0} />
          <p className="mt-1 text-xs text-muted">Dipakai oleh mesin payroll di Stage 4.</p>
        </div>
        <SubmitButton>Simpan karyawan</SubmitButton>
      </form>
    </div>
  );
}
