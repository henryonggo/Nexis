"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvite(token);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      {error && <div className="nx-error">{error}</div>}
      <button onClick={onAccept} disabled={pending} className="nx-btn">
        {pending ? "Memproses…" : "Terima & bergabung"}
      </button>
    </div>
  );
}
