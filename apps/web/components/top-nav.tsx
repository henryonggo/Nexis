"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { PILLARS, ICONS, getActivePillar, type NavItem } from "./app-sidebar";

const linkClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
    active
      ? "bg-brand/10 text-brand font-semibold shadow-sm"
      : "text-muted hover:bg-white/10 hover:text-ink",
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
