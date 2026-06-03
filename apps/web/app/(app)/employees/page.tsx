import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import type { EmployeeRow, CompanyBillingRow } from "@nexis/types";

export default async function EmployeesPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, employee_no, position, department, status, employment_type")
    .eq("company_id", active.id)
    .order("created_at", { ascending: true });

  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan, free_seat_limit, active_seats")
    .eq("company_id", active.id)
    .maybeSingle<Pick<CompanyBillingRow, "plan" | "free_seat_limit" | "active_seats">>();

  const rows = (employees as Partial<EmployeeRow>[] | null) ?? [];
  const isAdmin = active.role === "owner" || active.role === "admin";
  const seatsUsed = billing?.active_seats ?? rows.length;
  const limit = billing?.free_seat_limit ?? 5;
  const atLimit = billing?.plan === "free" && seatsUsed >= limit;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Karyawan</h1>
          {billing?.plan === "free" && (
            <p className="text-sm text-muted">
              {seatsUsed}/{limit} kursi gratis terpakai
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/employees/import"
              className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light"
            >
              Impor CSV
            </Link>
            <Link
              href="/employees/new"
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                atLimit ? "pointer-events-none bg-muted opacity-60" : "bg-brand hover:bg-brand-dark"
              }`}
            >
              + Tambah karyawan
            </Link>
          </div>
        )}
      </div>

      {atLimit && (
        <div className="rounded-lg border border-warning/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Anda telah memakai semua kursi gratis ({limit}). <strong>Upgrade</strong> untuk menambah
          karyawan (penagihan tersedia di Stage 6).
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">No.</th>
              <th className="px-4 py-2 font-medium">Posisi</th>
              <th className="px-4 py-2 font-medium">Departemen</th>
              <th className="px-4 py-2 font-medium">Tipe</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Belum ada karyawan. {isAdmin && "Tambahkan karyawan pertama Anda."}
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="border-t border-[color:var(--border)]">
                  <td className="px-4 py-2 text-ink">
                    <Link href={`/employees/${e.id}`} className="nx-link">
                      {e.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted">{e.employee_no ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{e.position ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{e.department ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{e.employment_type}</td>
                  <td className="px-4 py-2 text-muted">{e.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
