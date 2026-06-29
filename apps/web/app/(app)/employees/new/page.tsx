import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveCompany } from "@/lib/company";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { NewEmployeeForm } from "./form";

export default async function NewEmployeePage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/employees");
  const t = await getTranslations("employees");

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader
        icon={ICONS["employees"]}
        title={t("newTitle")}
        description={t("companyLabel", { name: active.name })}
      />
      <NewEmployeeForm />
    </div>
  );
}
