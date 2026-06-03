import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveCompany } from "@/lib/company";
import { ImportForm } from "./form";

export default async function ImportEmployeesPage() {
  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");
  if (active.role !== "owner" && active.role !== "admin") redirect("/employees");

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/employees" className="nx-link text-sm">← Kembali</Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">Impor karyawan (CSV)</h1>
        <p className="text-sm text-muted">
          Kolom: <code>full_name, employee_no, email, position, department, base_salary</code>.
          Baris header opsional. Batas paket gratis tetap berlaku (5 karyawan).
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
