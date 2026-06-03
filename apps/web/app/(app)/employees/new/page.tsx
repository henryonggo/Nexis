import { redirect } from "next/navigation";
import { getActiveCompany } from "@/lib/company";
import { NewEmployeeForm } from "./form";

export default async function NewEmployeePage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/employees");

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Tambah karyawan</h1>
        <p className="text-sm text-muted">Perusahaan: {active.name}</p>
      </div>
      <NewEmployeeForm />
    </div>
  );
}
