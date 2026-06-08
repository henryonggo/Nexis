"use client";

import { useState, useTransition } from "react";
import { deactivateAccount } from "./actions";

/** Two-step confirm before deactivating the account (destructive-ish, reversible). */
export function DeactivateSection() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await deactivateAccount();
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-4">
      <h2 className="text-sm font-semibold text-red-700">Nonaktifkan akun</h2>
      <p className="mt-1 text-sm text-muted">
        Akun Anda akan dinonaktifkan dan Anda akan keluar. Hubungi dukungan untuk
        mengaktifkannya kembali.
      </p>

      {error && <div className="nx-error mt-3">{error}</div>}

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "Memproses…" : "Ya, nonaktifkan akun saya"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm text-muted hover:underline"
          >
            Batal
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Nonaktifkan akun
        </button>
      )}
    </div>
  );
}
