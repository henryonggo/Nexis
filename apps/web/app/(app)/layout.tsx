import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getActiveCompany } from "@/lib/company";
import { getEmployeeAccess, ACCESS_NAV_FLAGS } from "@/lib/access";
import { isSuperadminEmail } from "@/lib/superadmin";
import { signOut } from "../(auth)/actions";
import { CompanySwitcher } from "@/components/company-switcher";
import { IdleTimeout } from "@/components/idle-timeout";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { DesktopSidebar, MobileNav } from "@/components/app-sidebar";
import { NAV_GROUPS, type NavGroup, type NavGroupKey, type NavItem } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

type Role = "owner" | "admin" | "manager" | "employee";

// Mirrors the per-page guards: owner/admin see everything; managers see the
// approval/oversight surfaces; employees see only self-service views (their
// data is further limited to their own rows by RLS). Order = sidebar order
// within each group.
const NAV: ReadonlyArray<{ href: string; key: string; group: NavGroupKey; roles: readonly Role[] }> = [
  { href: "/dashboard", key: "dashboard", group: "main", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/approvals", key: "approvals", group: "main", roles: ["owner", "admin"] },
  { href: "/payroll", key: "payroll", group: "main", roles: ["owner", "admin"] },
  { href: "/profile", key: "profile", group: "main", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/employees", key: "employees", group: "team", roles: ["owner", "admin", "manager"] },
  { href: "/attendance", key: "attendance", group: "team", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/leave", key: "leave", group: "team", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/claims", key: "claims", group: "team", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/loans", key: "loans", group: "team", roles: ["owner", "admin", "manager"] },
  { href: "/earnings", key: "earnings", group: "pay", roles: ["owner", "admin"] },
  { href: "/deductions", key: "deductions", group: "pay", roles: ["owner", "admin"] },
  { href: "/payslips", key: "payslips", group: "pay", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/reports", key: "reports", group: "pay", roles: ["owner", "admin", "manager"] },
  { href: "/members", key: "members", group: "company", roles: ["owner", "admin"] },
  { href: "/access", key: "access", group: "company", roles: ["owner", "admin"] },
  { href: "/audit", key: "audit", group: "company", roles: ["owner", "admin"] },
  { href: "/billing", key: "billing", group: "company", roles: ["owner", "admin"] },
  { href: "/settings", key: "settings", group: "company", roles: ["owner", "admin"] },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  const active = await getActiveCompany(memberships);
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");

  const role = (active?.role ?? "employee") as Role;
  let items = NAV.filter((item) => item.roles.includes(role));

  // Employees only: drop nav entries the company has turned off.
  if (role === "employee" && active) {
    const access = await getEmployeeAccess(active.id);
    items = items.filter((item) => {
      const flag = ACCESS_NAV_FLAGS[item.key];
      return !flag || access[flag];
    });
  }

  const navGroups: NavGroup[] = NAV_GROUPS.map((group) => ({
    key: group,
    label: group === "main" ? null : t(`groups.${group}`),
    items: items
      .filter((item) => item.group === group)
      .map((item): NavItem => ({ href: item.href, key: item.key, label: t(item.key) })),
  })).filter((g) => g.items.length > 0);

  // Platform superadmins (email allowlist, above tenancy) get the free-pass
  // ops surface — last in the company group regardless of per-company role.
  if (isSuperadminEmail(user.email)) {
    const company = navGroups.find((g) => g.key === "company");
    const item: NavItem = { href: "/superadmin", key: "superadmin", label: t("superadmin") };
    if (company) company.items.push(item);
    else navGroups.push({ key: "company", label: t("groups.company"), items: [item] });
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <IdleTimeout />
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between glass-panel border-t-0 border-x-0 rounded-none px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <MobileNav groups={navGroups} />
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white font-bold text-sm shrink-0">
              N
            </div>
            <CompanySwitcher companies={memberships} activeId={active!.id} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/profile" className="hidden text-sm text-muted hover:text-brand sm:inline transition-colors font-medium">
              {user.email}
            </Link>
            <LocaleSwitcher />
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                {tc("signOut")}
              </Button>
            </form>
          </div>
        </header>

        <div className="flex">
          <DesktopSidebar groups={navGroups} />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
