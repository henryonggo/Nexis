"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { setCompanyFreePass, type FreePassState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/alert";

const initial: FreePassState = {};

/** Grant/revoke a single company's free pass, with inline result feedback. */
export function FreePassButton({
  companyId,
  comped,
}: {
  companyId: string;
  comped: boolean;
}) {
  const t = useTranslations("superadmin");
  const [state, action] = useFormState(setCompanyFreePass, initial);

  return (
    <div className="space-y-2">
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.ok && <Alert variant="success">{t("saved")}</Alert>}
      <form action={action}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="action" value={comped ? "revoke" : "grant"} />
        <SubmitButton>{comped ? t("revoke") : t("grant")}</SubmitButton>
      </form>
    </div>
  );
}
