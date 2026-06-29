"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { Lock, Eye, EyeOff, Trash } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import {
  revokeKeyAction,
  toggleWebhookAction,
  deleteWebhookAction,
  type DeveloperActionState,
} from "./actions";

const initial: DeveloperActionState = {};

export function RevokeKeyButton({ keyId }: { keyId: string }) {
  const t = useTranslations("developer.rowActions");
  const [, action] = useFormState(revokeKeyAction, initial);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="keyId" value={keyId} />
      <IconButton
        icon={Lock}
        label={t("revoke")}
        onClick={(e) => {
          e.preventDefault();
          formRef.current?.submit();
        }}
      />
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
  const t = useTranslations("developer.rowActions");
  const [, action] = useFormState(toggleWebhookAction, initial);
  const formRef = React.useRef<HTMLFormElement>(null);
  const Icon = isActive ? EyeOff : Eye;
  const label = isActive ? t("deactivate") : t("activate");

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="webhookId" value={webhookId} />
      <input type="hidden" name="isActive" value={String(isActive)} />
      <IconButton
        icon={Icon}
        label={label}
        onClick={(e) => {
          e.preventDefault();
          formRef.current?.submit();
        }}
      />
    </form>
  );
}

export function DeleteWebhookButton({ webhookId }: { webhookId: string }) {
  const t = useTranslations("developer.rowActions");
  const [, action] = useFormState(deleteWebhookAction, initial);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="webhookId" value={webhookId} />
      <IconButton
        icon={Trash}
        label={t("delete")}
        variant="destructive"
        onClick={(e) => {
          e.preventDefault();
          formRef.current?.submit();
        }}
      />
    </form>
  );
}
