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
import { PILLARS, PILLAR_ITEMS, type NavItem } from "@/lib/nav";
import { TopNav } from "@/components/top-nav";
import { CommandCenter } from "@/components/command-center";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

type Role = "owner" | "admin" | "manager" | "employee";

// Mirrors the per-page guards: owner/admin see everything; managers see the
// approval/oversight surfaces; employees see only self-service views (their
// data is further limited to their own rows by RLS).
const NAV: ReadonlyArray<{ href: string; key: string; roles: readonly Role[] }> = [
  { href: "/dashboard", key: "dashboard", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/profile", key: "profile", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/employees", key: "employees", roles: ["owner", "admin", "manager"] },
  { href: "/attendance", key: "attendance", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/leave", key: "leave", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/claims", key: "claims", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/payslips", key: "payslips", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/loans", key: "loans", roles: ["owner", "admin", "manager"] },
  { href: "/earnings", key: "earnings", roles: ["owner", "admin"] },
  { href: "/deductions", key: "deductions", roles: ["owner", "admin"] },
  { href: "/payroll", key: "payroll", roles: ["owner", "admin"] },
  { href: "/approvals", key: "approvals", roles: ["owner", "admin"] },
  { href: "/performance", key: "performance", roles: ["owner", "admin", "manager"] },
  { href: "/analytics", key: "analytics", roles: ["owner", "admin"] },
  { href: "/reports", key: "reports", roles: ["owner", "admin", "manager"] },
  { href: "/billing", key: "billing", roles: ["owner", "admin"] },
  { href: "/audit", key: "audit", roles: ["owner", "admin"] },
  { href: "/developer", key: "developer", roles: ["owner", "admin"] },
  { href: "/members", key: "members", roles: ["owner", "admin"] },
  { href: "/access", key: "access", roles: ["owner", "admin"] },
  { href: "/settings", key: "settings", roles: ["owner", "admin"] },
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
  let navItems: NavItem[] = NAV.filter((item) => item.roles.includes(role)).map(
    (item) => ({ href: item.href, key: item.key, label: t(item.key) }),
  );

  // Employees only: drop nav entries the company has turned off, and read the
  // owner/admin-chosen nav layout (flat list vs. grouped pillars).
  let navStyle: "flat" | "pillars" = "flat";
  if (role === "employee" && active) {
    const access = await getEmployeeAccess(active.id);
    navStyle = access.navStyle;
    navItems = navItems.filter((item) => {
      const flag = ACCESS_NAV_FLAGS[item.key];
      return !flag || access[flag];
    });
  }

  // Platform superadmins (email allowlist, above tenancy) get the cross-company
  // free-pass surface — appended regardless of their per-company role.
  if (isSuperadminEmail(user.email)) {
    navItems.push({ href: "/superadmin", key: "superadmin", label: t("superadmin") });
  }

  // Flat employees use the top item list; everyone else uses pillar groups.
  const flat = role === "employee" && navStyle === "flat";

  // Top pillars: show a pillar only if the role can reach at least one of its items.
  const navKeys = new Set(navItems.map((n) => n.key));
  const pillarKeys = PILLARS.filter((p) =>
    (PILLAR_ITEMS[p.key] ?? []).some((k) => navKeys.has(k)),
  ).map((p) => p.key);

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <IdleTimeout />
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between glass-panel border-t-0 border-x-0 rounded-none px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <MobileNav items={navItems} pillarKeys={pillarKeys} flat={flat} />
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white font-bold text-sm shrink-0">
              N
            </div>
            <CompanySwitcher companies={memberships} activeId={active!.id} />
          </div>

          <TopNav items={navItems} pillarKeys={pillarKeys} flat={flat} />

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
          {/* Flat nav has no sidebar; pillar roles (and pillar-mode employees) do. */}
          {!flat && <DesktopSidebar items={navItems} />}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
        <CommandCenter />
      </div>
    </TooltipProvider>
  );
}
