import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveCompany } from "@/lib/company";
import { getEmployeeAccess } from "@/lib/access";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { AccessForm } from "./access-form";

export default async function AccessPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/dashboard");

  const access = await getEmployeeAccess(active.id);
  const t = await getTranslations("access");

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        icon={ICONS["access"]}
        title={t("title")}
        description={t("subtitle")}
      />
      <AccessForm defaults={access} />
    </div>
  );
}
