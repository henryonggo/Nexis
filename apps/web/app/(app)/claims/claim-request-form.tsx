"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { fieldClasses } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestClaim, type DecisionState } from "./actions";

const initial: DecisionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {label}
    </Button>
  );
}

export function ClaimRequestForm({ claimTypes }: { claimTypes: { id: string; name: string }[] }) {
  const t = useTranslations("claims.request");
  const [state, action] = useFormState(requestClaim, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{t("title")}</h2>
      <form ref={formRef} action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">{t("type")}</span>
          <select name="claimTypeId" required defaultValue="" className={fieldClasses}>
            <option value="" disabled>
              {t("typePlaceholder")}
            </option>
            {claimTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted">{t("amount")}</span>
          <input
            type="text"
            inputMode="numeric"
            name="amount"
            required
            placeholder="150.000"
            className={fieldClasses}
          />
        </label>

        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted">{t("description")}</span>
          <textarea
            name="description"
            rows={2}
            maxLength={500}
            className={`${fieldClasses} h-auto py-2`}
          />
        </label>

        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted">{t("receipt")}</span>
          <input
            type="file"
            name="receipt"
            accept="image/*,application/pdf"
            className={fieldClasses}
          />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <SubmitButton label={t("submit")} />
          {state.error && <span className="text-sm text-danger">{state.error}</span>}
          {state.ok && <span className="text-sm text-success">{t("submitted")}</span>}
        </div>
      </form>
    </Card>
  );
}
