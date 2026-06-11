import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getActiveCompany } from "@/lib/company";
import { signOut } from "../(auth)/actions";
import { CompanySwitcher } from "@/components/company-switcher";
import { IdleTimeout } from "@/components/idle-timeout";
import { LocaleSwitcher } from "@/components/locale-switcher";

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

  return (
    <div className="min-h-screen">
      <IdleTimeout />
      <header className="flex items-center justify-between border-b border-[color:var(--border)] bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-brand">Nexis</span>
          <CompanySwitcher companies={memberships} activeId={active!.id} />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
          <LocaleSwitcher />
          <form action={signOut}>
            <button className="whitespace-nowrap rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm text-ink hover:bg-brand-light">
              {tc("signOut")}
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 md:flex-row md:gap-6">
        <nav className="flex w-full gap-1 overflow-x-auto md:w-44 md:shrink-0 md:flex-col md:space-y-1 md:overflow-visible">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block whitespace-nowrap rounded-md px-3 py-2 text-sm text-ink hover:bg-brand-light"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
