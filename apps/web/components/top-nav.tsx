"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PILLARS, getActivePillar } from "./app-sidebar";

export function TopNav() {
  const pathname = usePathname();
  const activePillar = getActivePillar(pathname);
  const t = useTranslations("nav");

  return (
    <nav className="hidden md:flex items-center gap-1.5">
      {PILLARS.map((p) => {
        const Icon = p.icon;
        const active = activePillar === p.key;
        return (
          <Link
            key={p.key}
            href={p.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              active
                ? "bg-brand/10 text-brand font-semibold shadow-sm"
                : "text-muted hover:bg-white/10 hover:text-ink"
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span>{t(p.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
