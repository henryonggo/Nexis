import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { EditEmployeeForm } from "./form";

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("id", params.id)
    .eq("company_id", active.id)
    .maybeSingle();

  if (!employee) notFound();

  const { data: comp } = await supabase
    .from("compensation")
    .select("base_salary")
    .eq("employee_id", params.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: tax } = await supabase
    .from("tax_profile")
    .select("ptkp_status, npwp")
    .eq("employee_id", params.id)
    .maybeSingle();

  // Candidate managers: other active employees in the company (drives team scoping).
  const { data: coworkers } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("company_id", active.id)
    .in("status", ["active", "probation"])
    .neq("id", params.id)
    .order("full_name", { ascending: true });

  const canEdit = active.role === "owner" || active.role === "admin";
  const t = await getTranslations("employees");

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link href="/employees" className="text-sm font-medium text-brand hover:underline">{t("back")}</Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">{employee.full_name}</h1>
            <p className="text-sm text-muted">{employee.position ?? "—"}</p>
          </div>
          {employee.user_id ? (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              {t("appLinked")}
            </span>
          ) : (
            canEdit &&
            employee.email && (
              <Link
                href={`/members?email=${encodeURIComponent(employee.email)}&role=employee`}
                className="rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-light"
              >
                {t("inviteToApp")}
              </Link>
            )
          )}
        </div>
      </div>

      <EditEmployeeForm
        canEdit={canEdit}
        employee={employee}
        baseSalary={comp?.base_salary ?? 0}
        ptkpStatus={tax?.ptkp_status ?? "TK/0"}
        npwp={tax?.npwp ?? ""}
        coworkers={coworkers ?? []}
      />
    </div>
  );
}
