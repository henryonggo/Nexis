"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function onAccept() {
    setError(null);
    setIsPending(true);
    acceptInvite(token).then((res) => {
      if (res?.error) {
        setError(res.error);
        setIsPending(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && <div className="nx-error">{error}</div>}
      <button onClick={onAccept} disabled={isPending} className="nx-btn">
        {isPending ? "Memproses…" : "Terima & bergabung"}
      </button>
    </div>
  );
}
