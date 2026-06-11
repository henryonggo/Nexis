import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getActiveCompany } from "@/lib/company";
import { ImportForm } from "./form";

export default async function ImportEmployeesPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/employees");
  const t = await getTranslations("employees");

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/employees" className="nx-link text-sm">{t("back")}</Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">{t("import.title")}</h1>
        <p className="text-sm text-muted">
          {t("import.columnsLabel")}{" "}
          <code>full_name, employee_no, email, position, department, base_salary</code>
          {t("import.headerNote")}
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
