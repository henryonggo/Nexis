import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getActiveCompany } from "@/lib/company";
import { signOut } from "../(auth)/actions";
import { CompanySwitcher } from "@/components/company-switcher";
import { IdleTimeout } from "@/components/idle-timeout";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { DesktopSidebar, MobileNav, type NavItem } from "@/components/app-sidebar";
import { TopNav } from "@/components/top-nav";
import { CommandCenter } from "@/components/command-center";
import { Button } from "@/components/ui/button";

type Role = "owner" | "admin" | "manager" | "employee";

// Mirrors the per-page guards: owner/admin see everything; managers see the
// approval/oversight surfaces; employees see only self-service views (their
// data is further limited to their own rows by RLS).
const NAV: ReadonlyArray<{ href: string; key: string; roles: readonly Role[] }> = [
  { href: "/dashboard", key: "dashboard", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/employees", key: "employees", roles: ["owner", "admin", "manager"] },
  { href: "/attendance", key: "attendance", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/leave", key: "leave", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/claims", key: "claims", roles: ["owner", "admin", "manager", "employee"] },
  { href: "/loans", key: "loans", roles: ["owner", "admin", "manager"] },
  { href: "/payroll", key: "payroll", roles: ["owner", "admin"] },
  { href: "/performance", key: "performance", roles: ["owner", "admin", "manager"] },
  { href: "/analytics", key: "analytics", roles: ["owner", "admin"] },
  { href: "/reports", key: "reports", roles: ["owner", "admin", "manager"] },
  { href: "/billing", key: "billing", roles: ["owner", "admin"] },
  { href: "/audit", key: "audit", roles: ["owner", "admin"] },
  { href: "/developer", key: "developer", roles: ["owner", "admin"] },
  { href: "/members", key: "members", roles: ["owner", "admin"] },
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
  const navItems: NavItem[] = NAV.filter((item) => item.roles.includes(role)).map(
    (item) => ({ href: item.href, key: item.key, label: t(item.key) }),
  );

  return (
    <div className="min-h-screen">
      <IdleTimeout />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between glass-panel border-t-0 border-x-0 rounded-none px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <MobileNav items={navItems} />
          <span className="text-lg font-bold text-brand">Nexis</span>
          <CompanySwitcher companies={memberships} activeId={active!.id} />
        </div>

        <TopNav />

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
          <LocaleSwitcher />
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              {tc("signOut")}
            </Button>
          </form>
        </div>
      </header>

      <div className="flex">
        <DesktopSidebar items={navItems} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <CommandCenter />
    </div>
  );
}
