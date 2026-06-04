"use client";

import { useFormState } from "react-dom";
import { upgradePlan, type BillingActionState } from "./actions";
import { UPGRADEABLE_PLANS, formatRupiah } from "@/lib/billing-plans";
import { SubmitButton } from "@/components/submit-button";

const initial: BillingActionState = {};

export function UpgradeForm({
  defaultEmail,
  currentPlan,
}: {
  defaultEmail: string;
  currentPlan: string;
}) {
  const [state, action] = useFormState(upgradePlan, initial);

  // Default the picker to the first plan above the current one.
  const defaultPlan =
    UPGRADEABLE_PLANS.find((p) => p.id !== currentPlan)?.id ?? UPGRADEABLE_PLANS[0]!.id;

  return (
    <div className="nx-card max-w-xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Upgrade paket</h2>
      <p className="mb-4 text-sm text-muted">
        Upgrade membuka lebih dari 5 karyawan. NPWP dan nomor BPJS perusahaan wajib
        diisi untuk pelaporan pajak & iuran.
      </p>

      {state.error && <div className="nx-error mb-4">{state.error}</div>}
      {state.ok && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Paket berhasil diperbarui. Batas karyawan kini mengikuti paket baru.
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label className="nx-label" htmlFor="plan">
            Paket
          </label>
          <select id="plan" name="plan" className="nx-input" defaultValue={defaultPlan}>
            {UPGRADEABLE_PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.pricePerSeat != null ? `${formatRupiah(p.pricePerSeat)}/karyawan/bln` : "Hubungi kami"}
                {p.seatCap != null ? ` (maks ${p.seatCap})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="nx-label" htmlFor="npwp">
            NPWP perusahaan
          </label>
          <input
            id="npwp"
            name="npwp"
            className="nx-input"
            placeholder="99.999.999.9-999.999"
            inputMode="numeric"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nx-label" htmlFor="bpjsKes">
              No. BPJS Kesehatan
            </label>
            <input id="bpjsKes" name="bpjsKes" className="nx-input" inputMode="numeric" required />
          </div>
          <div>
            <label className="nx-label" htmlFor="bpjsTk">
              No. BPJS Ketenagakerjaan
            </label>
            <input id="bpjsTk" name="bpjsTk" className="nx-input" inputMode="numeric" required />
          </div>
        </div>

        <div>
          <label className="nx-label" htmlFor="billingEmail">
            Email penagihan
          </label>
          <input
            id="billingEmail"
            name="billingEmail"
            type="email"
            className="nx-input"
            defaultValue={defaultEmail}
            required
          />
        </div>

        <p className="text-xs text-muted">
          Pembayaran berjalan di mode sandbox — belum ada kartu yang ditagih.
        </p>

        <div className="pt-1">
          <SubmitButton>Konfirmasi upgrade</SubmitButton>
        </div>
      </form>
    </div>
  );
}
