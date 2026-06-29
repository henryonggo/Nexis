import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getActiveCompany } from "@/lib/company";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { ImportForm } from "./form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function ImportEmployeesPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/employees");
  const t = await getTranslations("employees");

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 -mx-2 -mt-2 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/employees" className="flex items-center gap-2 px-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">{t("back")}</span>
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={ICONS["employees"]}
        title={t("import.title")}
        description={
          <>
            {t("import.columnsLabel")}{" "}
            <code className="bg-surface-2 px-1 py-0.5 rounded text-xs">
              full_name, employee_no, email, position, department, base_salary
            </code>
            {t("import.headerNote")}
          </>
        }
      />
      <ImportForm />
    </div>
  );
}
