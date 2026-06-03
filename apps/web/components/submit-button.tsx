"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="nx-btn" disabled={pending} aria-busy={pending}>
      {pending ? "Memproses…" : children}
    </button>
  );
}
