import { redirect } from "next/navigation";
import { getActiveCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { computeRunReadiness } from "@/lib/payroll";
import { NewRunForm } from "./form";

/** Default to the most recently completed month (payroll usually runs in arrears). */
function previousMonth(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default async function NewPayrollRunPage() {
  const active = await getActiveCompany();
  if (!active) return null;
  if (!isAdminRole(active.role)) {
    redirect("/payroll");
  }

  const { year, month } = previousMonth();
  // A readiness-fetch failure (e.g. a rejected query promise) must not take down
  // the whole page render — fall back to no blockers/warnings and let the form
  // load. createDraftRun re-checks readiness server-side before drafting, so an
  // empty gate here can't produce a bad run.
  let readiness;
  try {
    readiness = await computeRunReadiness(createClient(), active.id, { year, month });
  } catch (err) {
    console.error("computeRunReadiness failed", err);
    readiness = { ready: false, blockers: [], warnings: [] };
  }

  return (
    <NewRunForm
      defaultYear={year}
      defaultMonth={month}
      blockers={readiness.blockers}
      warnings={readiness.warnings}
    />
  );
}
