"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICONS, type NavGroup, type NavItem } from "@/lib/nav";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = ICONS[item.key] ?? LayoutDashboard;
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-brand-050 text-brand font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-brand before:rounded-r-sm"
          : "text-muted hover:bg-white/10 hover:text-ink",
        collapsed && "justify-center px-2",
      )}
      aria-label={item.label}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function NavList({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-3 p-2">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5" data-nav-group={group.key}>
          {group.label &&
            (collapsed ? (
              <div className="mx-2 my-1 border-t border-hairline" />
            ) : (
              <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </div>
            ))}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function DesktopSidebar({ groups }: { groups: NavGroup[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const tc = useTranslations("common");

  return (
    <aside
      className={cn(
        "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 glass-panel transition-[width] duration-base md:block z-10",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Brand monogram */}
        <div className="flex items-center justify-center py-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white font-bold text-sm">
            N
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList groups={groups} collapsed={collapsed} />
        </div>

        {/* Expand/collapse toggle pinned to the bottom */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="m-2 flex items-center justify-center rounded-md px-3 py-2 text-muted hover:bg-white/10 hover:text-ink transition-colors"
          aria-label={collapsed ? tc("expandSidebar") : tc("collapseSidebar")}
        >
          {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);

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
          <div className="absolute left-0 top-0 h-full w-72 bg-card flex flex-col shadow-elev-4 border-r border-white/20 rounded-none">
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

            <div className="flex-1 overflow-y-auto">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
