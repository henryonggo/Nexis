"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { inviteMember, type MemberState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: MemberState = {};

export function InviteForm() {
  const t = useTranslations("members.invite");
  const tc = useTranslations("common");
  const tRoles = useTranslations("roles");
  const [state, action] = useFormState(inviteMember, initial);

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink">{t("title")}</h2>

      {state.error && <Alert variant="destructive" className="mb-3">{state.error}</Alert>}
      {state.success && <Alert variant="success" className="mb-3">{state.success}</Alert>}
      {state.inviteUrl && (
        <div className="mb-3 rounded-md bg-brand-light px-3 py-2 text-xs text-brand-dark">
          {t("shareLink")}
          <br />
          <code className="break-all">{state.inviteUrl}</code>
        </div>
      )}

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1.5 sm:w-44">
          <Label htmlFor="role">{t("role")}</Label>
          <select id="role" name="role" className={fieldClasses} defaultValue="employee">
            <option value="admin">{tRoles("admin")}</option>
            <option value="manager">{tRoles("manager")}</option>
            <option value="employee">{tRoles("employee")}</option>
          </select>
        </div>
        <div className="sm:w-36">
          <SubmitButton>{t("send")}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
