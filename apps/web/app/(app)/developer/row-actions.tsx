"use client";

import { useFormState } from "react-dom";
import {
  revokeKeyAction,
  toggleWebhookAction,
  deleteWebhookAction,
  type DeveloperActionState,
} from "./actions";

const initial: DeveloperActionState = {};

const ghostBtn =
  "rounded-md border border-[color:var(--border)] px-3 py-1 text-sm font-medium text-ink hover:bg-brand-light disabled:opacity-50";

export function RevokeKeyButton({ keyId }: { keyId: string }) {
  const [, action] = useFormState(revokeKeyAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="keyId" value={keyId} />
      <button type="submit" className={ghostBtn}>
        Cabut
      </button>
    </form>
  );
}

export function ToggleWebhookButton({
  webhookId,
  isActive,
}: {
  webhookId: string;
  isActive: boolean;
}) {
  const [, action] = useFormState(toggleWebhookAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="webhookId" value={webhookId} />
      <input type="hidden" name="isActive" value={String(isActive)} />
      <button type="submit" className={ghostBtn}>
        {isActive ? "Nonaktifkan" : "Aktifkan"}
      </button>
    </form>
  );
}

export function DeleteWebhookButton({ webhookId }: { webhookId: string }) {
  const [, action] = useFormState(deleteWebhookAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="webhookId" value={webhookId} />
      <button type="submit" className={`${ghostBtn} text-red-600`}>
        Hapus
      </button>
    </form>
  );
}
