import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getActiveCompany } from "@/lib/company";
import { signOut } from "../(auth)/actions";
import { CompanySwitcher } from "@/components/company-switcher";
import { IdleTimeout } from "@/components/idle-timeout";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { DesktopSidebar, MobileNav, type NavItem } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/employees", key: "employees" },
  { href: "/attendance", key: "attendance" },
  { href: "/leave", key: "leave" },
  { href: "/claims", key: "claims" },
  { href: "/loans", key: "loans" },
  { href: "/payroll", key: "payroll" },
  { href: "/performance", key: "performance" },
  { href: "/analytics", key: "analytics" },
  { href: "/reports", key: "reports" },
  { href: "/billing", key: "billing" },
  { href: "/audit", key: "audit" },
  { href: "/developer", key: "developer" },
  { href: "/members", key: "members" },
  { href: "/settings", key: "settings" },
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

  const navItems: NavItem[] = NAV.map((item) => ({ ...item, label: t(item.key) }));

  return (
    <div className="min-h-screen">
      <IdleTimeout />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <MobileNav items={navItems} />
          <span className="text-lg font-bold text-brand">Nexis</span>
          <CompanySwitcher companies={memberships} activeId={active!.id} />
        </div>
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
    </div>
  );
}
