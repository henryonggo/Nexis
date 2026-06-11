"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { importEmployees, type ImportResult } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const initial: ImportResult = {};

const SAMPLE = `full_name,employee_no,email,position,department,base_salary
Budi Santoso,EMP001,budi@contoh.id,Staf,Operasional,6000000
Siti Aminah,EMP002,siti@contoh.id,Akuntan,Keuangan,8500000`;

export function ImportForm() {
  const t = useTranslations("employees.import");
  const [state, action] = useFormState(importEmployees, initial);

  return (
    <div className="space-y-4">
      <Card asChild className="max-w-2xl p-8">
        <form action={action} className="space-y-4">
          {state.error && <Alert variant="destructive">{state.error}</Alert>}
          {typeof state.created === "number" && (
            <Alert variant="success">
              {t("created", { count: state.created })}
              {state.stoppedAtLimit && t("stoppedAtLimit")}
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="csv">{t("pasteCsv")}</Label>
            <textarea
              id="csv"
              name="csv"
              className={cn(fieldClasses, "h-48 py-2 font-mono text-xs")}
              placeholder={SAMPLE}
              required
            />
          </div>
          <SubmitButton>{t("submit")}</SubmitButton>
        </form>
      </Card>

      {state.failures && state.failures.length > 0 && (
        <Alert variant="warning">
          <p className="mb-2 font-semibold">{t("skippedRows")}</p>
          <ul className="space-y-1">
            {state.failures.map((f, i) => (
              <li key={i}>{t("rowLine", { line: f.line, name: f.name, reason: f.reason })}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
