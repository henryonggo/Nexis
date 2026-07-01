"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { createCompany, joinCompanyViaInvite, type CreateCompanyState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: CreateCompanyState = {};

type Mode = "create" | "join";

export function CreateCompanyForm() {
  const t = useTranslations("companies");
  const tco = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<Mode>("create");
  const [createState, createAction] = useFormState(createCompany, initial);
  const [joinState, joinAction] = useFormState(joinCompanyViaInvite, initial);

  const state = mode === "create" ? createState : joinState;
  const action = mode === "create" ? createAction : joinAction;

  return (
    <Card className="max-w-md p-8">
      <h1 className="mb-1 text-xl font-bold text-ink">{t("newTitle")}</h1>
      <p className="mb-5 text-sm text-muted">{t("newSubtitle")}</p>

      {state.error && <Alert variant="destructive" className="mb-4">{state.error}</Alert>}

      {/* Mode toggle */}
      <div className="mb-6 flex gap-2">
        <Button
          type="button"
          variant={mode === "create" ? "default" : "outline"}
          className="flex-1"
          onClick={() => {
            setMode("create");
          }}
        >
          {tco("createTab")}
        </Button>
        <Button
          type="button"
          variant={mode === "join" ? "default" : "outline"}
          className="flex-1"
          onClick={() => {
            setMode("join");
          }}
        >
          {tco("joinTab")}
        </Button>
      </div>

      {/* Create company form */}
      {mode === "create" && (
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{tco("nameLabel")}</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">
              {tco("industryLabel")} <span className="text-muted">{tc("optional")}</span>
            </Label>
            <Input id="industry" name="industry" placeholder={tco("industryPlaceholder")} />
          </div>
          <SubmitButton>{tco("submit")}</SubmitButton>
        </form>
      )}

      {/* Join company form */}
      {mode === "join" && (
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted">{tco("joinDescription")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inviteToken">{tco("inviteLabel")}</Label>
            <Input
              id="inviteToken"
              name="inviteToken"
              placeholder={tco("invitePlaceholder")}
              required
            />
          </div>
          <SubmitButton>{tco("joinSubmit")}</SubmitButton>
        </form>
      )}
    </Card>
  );
}
