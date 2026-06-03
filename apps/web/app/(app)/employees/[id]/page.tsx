import { notFound, redirect } from "next/navigation";
import Link from "next/link";
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

  const canEdit = active.role === "owner" || active.role === "admin";

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link href="/employees" className="nx-link text-sm">← Kembali</Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">{employee.full_name}</h1>
        <p className="text-sm text-muted">{employee.position ?? "—"}</p>
      </div>

      <EditEmployeeForm
        canEdit={canEdit}
        employee={employee}
        baseSalary={comp?.base_salary ?? 0}
        ptkpStatus={tax?.ptkp_status ?? "TK/0"}
        npwp={tax?.npwp ?? ""}
      />
    </div>
  );
}
