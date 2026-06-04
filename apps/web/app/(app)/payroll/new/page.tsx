import { redirect } from "next/navigation";
import { getActiveCompany } from "@/lib/company";
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
  if (active.role !== "owner" && active.role !== "admin") {
    redirect("/payroll");
  }

  const { year, month } = previousMonth();
  return <NewRunForm defaultYear={year} defaultMonth={month} />;
}
