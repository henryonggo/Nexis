import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatRupiah } from "@nexis/money";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const active = await getActiveCompany();
  if (!active) redirect("/onboarding");

  const t = await getTranslations("profile");
  const tRoles = await getTranslations("roles");

  // 1. Fetch user's profile details
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // 2. Fetch employee details for this user in the active company
  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", active.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // If there is an employee profile, fetch related data
  let compensation = null;
  let taxProfile = null;
  let bankAccount = null;

  if (employee) {
    const [compRes, taxRes, bankRes] = await Promise.all([
      supabase
        .from("compensation")
        .select("*")
        .eq("employee_id", employee.id)
        .maybeSingle(),
      supabase
        .from("tax_profile")
        .select("*")
        .eq("employee_id", employee.id)
        .maybeSingle(),
      supabase
        .from("bank_accounts")
        .select("*")
        .eq("employee_id", employee.id)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);

    compensation = compRes.data;
    taxProfile = taxRes.data;
    bankAccount = bankRes.data;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <Alert variant="warning">
        <AlertDescription className="text-sm font-medium">
          {t("noChangesAllowed")}
        </AlertDescription>
      </Alert>

      {/* Account Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("sections.account")}
        </h2>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted font-medium">{t("fields.name")}</label>
            <p className="text-sm font-semibold text-ink mt-0.5">{profile?.full_name || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-muted font-medium">{t("fields.email")}</label>
            <p className="text-sm font-semibold text-ink mt-0.5">{user.email}</p>
          </div>
          <div>
            <label className="text-xs text-muted font-medium">{t("fields.phone")}</label>
            <p className="text-sm font-semibold text-ink mt-0.5">{profile?.phone || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-muted font-medium">{t("fields.locale")}</label>
            <p className="text-sm font-semibold text-ink mt-0.5">{profile?.locale || "id-ID"}</p>
          </div>
        </Card>
      </section>

      {/* Employment Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("sections.employment")}
        </h2>
        {employee ? (
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.employeeNo")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{employee.employee_no || "—"}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.status")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5 capitalize">{employee.status}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.employmentType")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5 capitalize">{employee.employment_type}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.joinDate")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">
                {employee.join_date || "—"}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.department")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{employee.department || "—"}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.position")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{employee.position || "—"}</p>
            </div>
          </Card>
        ) : (
          <Card className="p-5 text-center text-sm text-muted">
            {t("messages.noEmployeeProfile")}
          </Card>
        )}
      </section>

      {/* Financial Section */}
      {employee && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t("sections.financial")}
          </h2>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.baseSalary")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">
                {compensation ? formatRupiah(compensation.base_salary) : "—"}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.bank")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{bankAccount?.bank_name || "—"}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.accountNo")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{bankAccount?.account_no || "—"}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.accountName")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{bankAccount?.account_name || "—"}</p>
            </div>
          </Card>
        </section>
      )}

      {/* Tax Section */}
      {employee && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t("sections.tax")}
          </h2>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.ptkpStatus")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">{taxProfile?.ptkp_status || "—"}</p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.npwp")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">
                {taxProfile?.has_npwp && taxProfile?.npwp
                  ? `${taxProfile.npwp} (${t("messages.hasNpwp")})`
                  : t("messages.noNpwp")}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.bpjsKes")}</label>
              <p className="text-sm font-semibold text-ink mt-0.5">
                {compensation?.bpjs_kes_enrolled
                  ? t("messages.enrolled")
                  : t("messages.notEnrolled")}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">{t("fields.bpjsTk")}</label>
              <div className="text-sm font-semibold text-ink mt-0.5 space-y-1">
                <p>
                  {t("fields.jht")}:{" "}
                  {compensation?.jht_enrolled
                    ? t("messages.enrolled")
                    : t("messages.notEnrolled")}
                </p>
                <p>
                  {t("fields.jp")}:{" "}
                  {compensation?.jp_enrolled
                    ? t("messages.enrolled")
                    : t("messages.notEnrolled")}
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
