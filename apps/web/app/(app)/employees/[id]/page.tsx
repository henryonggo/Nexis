import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  listCustomDeductions,
  listDeductionGroups,
  resolveEmployeeDeductions,
} from "@/lib/deductions";
import {
  listCustomEarnings,
  listEarningGroups,
  resolveEmployeeEarnings,
} from "@/lib/earnings";
import { normalizeWorkDays } from "@/lib/work-schedule";
import { listManualDeductions } from "@/lib/manual-deductions";
import { EditEmployeeForm } from "./form";
import { EmployeeDeductionsForm } from "./deductions-form";
import { EmployeeEarningsForm } from "./earnings-form";
import { ManualDeductionsForm } from "./manual-deductions-form";

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
    .select("base_salary, daily_rate, work_days, payment_method, pay_frequency")
    .eq("employee_id", params.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: tax } = await supabase
    .from("tax_profile")
    .select("ptkp_status, npwp")
    .eq("employee_id", params.id)
    .maybeSingle();

  const { data: bank } = await supabase
    .from("bank_accounts")
    .select("bank_name, account_no, account_name")
    .eq("employee_id", params.id)
    .eq("is_primary", true)
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

  // Configurable deductions: groups + custom types for the picker, and the
  // employee's currently resolved selection.
  const [groups, customs, resolved] = await Promise.all([
    listDeductionGroups(supabase, active.id),
    listCustomDeductions(supabase, active.id),
    resolveEmployeeDeductions(supabase, active.id, params.id),
  ]);
  const groupOptions = groups
    .filter((g) => g.active)
    .map((g) => ({ id: g.id, name: g.name, statutory: g.statutory }));
  const customOptions = customs.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));
  const currentDeductions = {
    source: resolved.source,
    groupId: resolved.groupId,
    statutory: resolved.items.filter((i) => i.statutoryCode).map((i) => i.statutoryCode!),
    customIds: resolved.items.filter((i) => i.custom).map((i) => i.custom!.id),
  };

  // Configurable earnings (allowances): groups + custom types for the picker, and
  // the employee's currently resolved selection (with per-person overrides).
  const [earningGroups, earningCustoms, resolvedEarnings] = await Promise.all([
    listEarningGroups(supabase, active.id),
    listCustomEarnings(supabase, active.id),
    resolveEmployeeEarnings(supabase, active.id, params.id),
  ]);
  const earningGroupOptions = earningGroups
    .filter((g) => g.active)
    .map((g) => ({ id: g.id, name: g.name }));
  const earningCustomOptions = earningCustoms
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name, calc: c.calc, amount: c.amount }));
  const selectedEarnings: Record<string, number | null> = {};
  for (const item of resolvedEarnings.items) {
    selectedEarnings[item.type.id] = item.amountOverride;
  }
  const currentEarnings = {
    source: resolvedEarnings.source,
    groupId: resolvedEarnings.groupId,
    selected: selectedEarnings,
  };

  // Manual/absence deductions recorded for this employee.
  const manualDeductions = await listManualDeductions(supabase, active.id, params.id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

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
        dailyRate={comp?.daily_rate ?? 0}
        workDaysOverride={comp?.work_days ? normalizeWorkDays(comp.work_days) : null}
        paymentMethod={(comp?.payment_method as "cash" | "bank") ?? "cash"}
        payFrequency={(comp?.pay_frequency as "monthly" | "daily" | "mixed") ?? "monthly"}
        ptkpStatus={tax?.ptkp_status ?? "TK/0"}
        npwp={tax?.npwp ?? ""}
        bankName={bank?.bank_name ?? ""}
        accountNo={bank?.account_no ?? ""}
        accountName={bank?.account_name ?? ""}
        coworkers={coworkers ?? []}
      />

      <EmployeeEarningsForm
        canEdit={canEdit}
        employeeId={employee.id}
        groups={earningGroupOptions}
        customs={earningCustomOptions}
        current={currentEarnings}
      />

      <EmployeeDeductionsForm
        canEdit={canEdit}
        employeeId={employee.id}
        groups={groupOptions}
        customs={customOptions}
        current={currentDeductions}
      />

      <ManualDeductionsForm
        canEdit={canEdit}
        employeeId={employee.id}
        entries={manualDeductions}
        today={today}
      />
    </div>
  );
}
