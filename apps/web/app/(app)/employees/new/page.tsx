import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveCompany } from "@/lib/company";
import { NewEmployeeForm } from "./form";

export default async function NewEmployeePage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/employees");
  const t = await getTranslations("employees");

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("newTitle")}</h1>
        <p className="text-sm text-muted">{t("companyLabel", { name: active.name })}</p>
      </div>
      <NewEmployeeForm />
    </div>
  );
}
