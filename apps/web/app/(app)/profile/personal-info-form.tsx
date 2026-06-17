"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { updateOwnContact, type ContactState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

const initial: ContactState = {};

/** Self-service contact + bank editor on the profile page (all roles, own record). */
export function PersonalInfoForm({
  phone,
  bankName,
  accountNo,
  accountName,
}: {
  phone: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}) {
  const t = useTranslations("profile.edit");
  const [state, action] = useFormState(updateOwnContact, initial);

  return (
    <Card className="p-5">
      {state.error && <Alert variant="destructive" className="mb-3">{state.error}</Alert>}
      {state.ok && <Alert variant="success" className="mb-3">{t("saved")}</Alert>}
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={phone} placeholder="08xxxxxxxxxx" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bankName">{t("bankName")}</Label>
            <Input id="bankName" name="bankName" defaultValue={bankName} placeholder="BCA" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountNo">{t("accountNo")}</Label>
            <Input id="accountNo" name="accountNo" inputMode="numeric" defaultValue={accountNo} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountName">{t("accountName")}</Label>
          <Input id="accountName" name="accountName" defaultValue={accountName} />
        </div>
        <SubmitButton>{t("save")}</SubmitButton>
      </form>
    </Card>
  );
}
