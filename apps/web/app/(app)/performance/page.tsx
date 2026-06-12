import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: { cycle?: string };
}) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("performance");
  const canManage =
    active.role === "owner" || active.role === "admin" || active.role === "manager";
  if (!canManage) {
    return (
      <Card className="max-w-lg p-8">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </Card>
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
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CycleForm />
        {selectedCycle && employees.length > 0 && (
          <GoalForm employees={employees} cycleId={selectedCycle.id} />
        )}
      </div>

      {cycles.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-muted">{t("noCycles")}</Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t("cycleLabel")}</span>
            {cycles.map((c) => (
              <Link
                key={c.id}
                href={`/performance?cycle=${c.id}`}
                className={`rounded-full px-3 py-1 text-sm ${
                  c.id === selectedCycle?.id
                    ? "bg-brand text-white"
                    : "border border-border text-ink hover:bg-brand-light"
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
                  {t("goalsHeading", { cycle: selectedCycle.name })}
                </h2>
                <GoalsTable goals={goals} />
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t("reviewsHeading")}
                </h2>
                {goalsByEmployee.size === 0 ? (
                  <Card className="px-4 py-6 text-center text-sm text-muted">{t("addGoalsFirst")}</Card>
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

async function GoalsTable({ goals }: { goals: GoalView[] }) {
  const t = await getTranslations("performance");
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("goalsColumns.employee")}</TableHead>
            <TableHead>{t("goalsColumns.goal")}</TableHead>
            <TableHead className="text-right">{t("goalsColumns.weight")}</TableHead>
            <TableHead>{t("goalsColumns.status")}</TableHead>
            <TableHead>{t("goalsColumns.progress")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {goals.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted">
                {t("noGoals")}
              </TableCell>
            </TableRow>
          ) : (
            goals.map((g) => (
              <TableRow key={g.id} className="align-top">
                <TableCell className="font-medium text-ink">{g.employeeName}</TableCell>
                <TableCell className="text-ink">
                  {g.title}
                  {g.description && <p className="text-xs text-muted">{g.description}</p>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-ink">{g.weight}%</TableCell>
                <TableCell>
                  <GoalStatusBadge status={g.status} />
                </TableCell>
                <TableCell>
                  <GoalProgress goalId={g.id} progress={g.progress} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
