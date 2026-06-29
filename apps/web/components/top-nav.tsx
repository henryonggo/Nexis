"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { PILLARS, ICONS, getActivePillar, type NavItem } from "@/lib/nav";

const linkClass = (active: boolean) =>
  cn(
    "relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
    active
      ? "text-brand font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand"
      : "text-muted hover:text-ink",
  );

export function TopNav({
  items,
  pillarKeys,
  flat,
}: {
  items: NavItem[];
  pillarKeys: string[];
  flat: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Employees get a flat list of their own pages instead of the pillar groups.
  if (flat) {
    return (
      <nav className="hidden md:flex items-center gap-1.5">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={linkClass(active)}>
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  const activePillar = getActivePillar(pathname);
  const pillars = PILLARS.filter((p) => pillarKeys.includes(p.key));

  return (
    <nav className="hidden md:flex items-center gap-1.5">
      {pillars.map((p) => {
        const Icon = p.icon;
        return (
          <Link key={p.key} href={p.href} className={linkClass(activePillar === p.key)}>
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span>{t(p.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
