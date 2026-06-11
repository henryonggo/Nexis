"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const t = useTranslations("common");
  return (
    <button type="submit" className="nx-btn" disabled={pending} aria-busy={pending}>
      {pending ? t("processing") : children}
    </button>
  );
}
