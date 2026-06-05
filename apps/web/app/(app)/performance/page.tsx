import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getCycles,
  getCycleGoals,
  getCycleReviews,
  type GoalView,
} from "@/lib/performance";
import { CycleForm } from "./cycle-form";
import { GoalForm, type EmployeeOption } from "./goal-form";
import { GoalProgress } from "./goal-progress";
import { ReviewForm } from "./review-form";
import { GoalStatusBadge } from "./status-badge";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: { cycle?: string };
}) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const canManage =
    active.role === "owner" || active.role === "admin" || active.role === "manager";
  if (!canManage) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">Kinerja & KPI</h1>
        <p className="text-sm text-muted">
          Hanya pemilik, admin, atau manajer yang dapat mengelola penilaian kinerja.
        </p>
      </div>
    );
  }

  const [cycles, { data: empData }] = await Promise.all([
    getCycles(supabase, active.id),
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", active.id)
      .in("status", ["active", "probation"])
      .order("full_name"),
  ]);

  const employees: EmployeeOption[] = (
    (empData as { id: string; full_name: string }[] | null) ?? []
  ).map((e) => ({ id: e.id, fullName: e.full_name }));

  const selectedCycle =
    cycles.find((c) => c.id === searchParams.cycle) ?? cycles[0] ?? null;

  const [goals, reviews] = selectedCycle
    ? await Promise.all([
        getCycleGoals(supabase, active.id, selectedCycle.id),
        getCycleReviews(supabase, active.id, selectedCycle.id),
      ])
    : [[], []];

  // Group goals by employee and index reviews by employee for the review cards.
  const goalsByEmployee = new Map<string, GoalView[]>();
  for (const g of goals) {
    const list = goalsByEmployee.get(g.employeeId) ?? [];
    list.push(g);
    goalsByEmployee.set(g.employeeId, list);
  }
  const reviewByEmployee = new Map(reviews.map((r) => [r.employeeId, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Kinerja & KPI</h1>
        <p className="text-sm text-muted">
          Tetapkan sasaran, pantau progres, dan nilai kinerja karyawan {active.name}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CycleForm />
        {selectedCycle && employees.length > 0 && (
          <GoalForm employees={employees} cycleId={selectedCycle.id} />
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="rounded-lg border border-[color:var(--border)] bg-white px-4 py-6 text-center text-sm text-muted">
          Belum ada siklus penilaian. Buat satu untuk mulai menetapkan sasaran.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Siklus:</span>
            {cycles.map((c) => (
              <Link
                key={c.id}
                href={`/performance?cycle=${c.id}`}
                className={`rounded-full px-3 py-1 text-sm ${
                  c.id === selectedCycle?.id
                    ? "bg-brand text-white"
                    : "border border-[color:var(--border)] text-ink hover:bg-brand-light"
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>

          {selectedCycle && (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Sasaran — {selectedCycle.name}
                </h2>
                <GoalsTable goals={goals} />
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Penilaian
                </h2>
                {goalsByEmployee.size === 0 ? (
                  <p className="rounded-lg border border-[color:var(--border)] bg-white px-4 py-6 text-center text-sm text-muted">
                    Tambahkan sasaran lebih dulu untuk menilai karyawan.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {[...goalsByEmployee.keys()].map((employeeId) => {
                      const r = reviewByEmployee.get(employeeId);
                      const name =
                        goalsByEmployee.get(employeeId)?.[0]?.employeeName ?? "—";
                      return (
                        <ReviewForm
                          key={employeeId}
                          cycleId={selectedCycle.id}
                          employeeId={employeeId}
                          employeeName={name}
                          reviewId={r?.id ?? null}
                          overallRating={r?.overallRating ?? null}
                          summary={r?.summary ?? null}
                          status={r?.status ?? null}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function GoalsTable({ goals }: { goals: GoalView[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-light/60 text-left text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Karyawan</th>
            <th className="px-4 py-2 font-medium">Sasaran</th>
            <th className="px-4 py-2 text-right font-medium">Bobot</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Progres</th>
          </tr>
        </thead>
        <tbody>
          {goals.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted">
                Belum ada sasaran pada siklus ini.
              </td>
            </tr>
          ) : (
            goals.map((g) => (
              <tr key={g.id} className="border-t border-[color:var(--border)] align-top">
                <td className="px-4 py-3 font-medium text-ink">{g.employeeName}</td>
                <td className="px-4 py-3 text-ink">
                  {g.title}
                  {g.description && <p className="text-xs text-muted">{g.description}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{g.weight}%</td>
                <td className="px-4 py-3">
                  <GoalStatusBadge status={g.status} />
                </td>
                <td className="px-4 py-3">
                  <GoalProgress goalId={g.id} progress={g.progress} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
