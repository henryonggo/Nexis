"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  ReceiptText,
  Landmark,
  Wallet,
  Target,
  BarChart3,
  FileText,
  CreditCard,
  ScrollText,
  Code2,
  UserCog,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  employees: Users,
  attendance: Clock,
  leave: CalendarDays,
  claims: ReceiptText,
  loans: Landmark,
  payroll: Wallet,
  performance: Target,
  analytics: BarChart3,
  reports: FileText,
  billing: CreditCard,
  audit: ScrollText,
  developer: Code2,
  members: UserCog,
  settings: Settings,
};

export type NavItem = { href: string; key: string; label: string };

export const PILLARS = [
  { key: "overview", labelKey: "overview", icon: LayoutDashboard, href: "/dashboard" },
  { key: "people", labelKey: "people", icon: Users, href: "/employees" },
  { key: "operations", labelKey: "operations", icon: CalendarDays, href: "/attendance" },
  { key: "finance", labelKey: "finance", icon: Wallet, href: "/payroll" },
  { key: "platform", labelKey: "platform", icon: SlidersHorizontal, href: "/settings" },
] as const;

export const PILLAR_ITEMS: Record<string, string[]> = {
  overview: ["dashboard", "analytics", "reports", "audit"],
  people: ["employees", "members"],
  operations: ["attendance", "leave", "performance"],
  finance: ["payroll", "claims", "loans", "billing"],
  platform: ["developer", "settings"],
};

export function getActivePillar(pathname: string): string {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/analytics") || pathname.startsWith("/reports") || pathname.startsWith("/audit")) return "overview";
  if (pathname.startsWith("/employees") || pathname.startsWith("/members")) return "people";
  if (pathname.startsWith("/attendance") || pathname.startsWith("/leave") || pathname.startsWith("/performance")) return "operations";
  if (pathname.startsWith("/payroll") || pathname.startsWith("/claims") || pathname.startsWith("/loans") || pathname.startsWith("/billing")) return "finance";
  if (pathname.startsWith("/developer") || pathname.startsWith("/settings")) return "platform";
  return "overview";
}

function NavList({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((item) => {
        const Icon = ICONS[item.key] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand/10 text-brand"
                : "text-muted hover:bg-white/10 hover:text-ink",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopSidebar({ items }: { items: NavItem[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const activePillar = getActivePillar(pathname);
  const allowedKeys = PILLAR_ITEMS[activePillar] ?? [];
  const filteredItems = items.filter((item) => allowedKeys.includes(item.key));

  return (
    <aside
      className={cn(
        "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 glass-panel transition-[width] md:block z-10",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-full flex-col justify-between">
        <NavList items={filteredItems} collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="m-2 flex items-center justify-center rounded-md px-3 py-2 text-muted hover:bg-white/10 hover:text-ink"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const currentPillar = getActivePillar(pathname);
  const [activeTab, setActiveTab] = useState(currentPillar);
  const t = useTranslations("nav");

  // Keep active tab in sync with user URL navigations
  useEffect(() => {
    setActiveTab(getActivePillar(pathname));
  }, [pathname]);

  const allowedKeys = PILLAR_ITEMS[activeTab] ?? [];
  const filteredItems = items.filter((item) => allowedKeys.includes(item.key));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-ink hover:bg-white/10 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 glass-panel flex flex-col shadow-elev-4 border-r-0 border-y-0 border-l-0 rounded-none">
            <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
              <span className="text-base font-bold text-brand">Nexis</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Navigation Pillars Grid */}
            <div className="grid grid-cols-5 border-b border-white/10 p-2 gap-1 bg-white/5">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                const active = activeTab === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setActiveTab(p.key)}
                    title={t(p.labelKey)}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded-md transition-colors",
                      active ? "bg-brand/10 text-brand" : "text-muted hover:text-ink hover:bg-white/5"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              <NavList items={filteredItems} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
