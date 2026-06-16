import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveCompany } from "@/lib/company";
import { getEmployeeAccess } from "@/lib/access";
import { AccessForm } from "./access-form";

export default async function AccessPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/dashboard");

  const access = await getEmployeeAccess(active.id);
  const t = await getTranslations("access");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <AccessForm defaults={access} />
    </div>
  );
}
