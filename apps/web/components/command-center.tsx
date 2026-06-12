"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  ReceiptText,
  Landmark,
  Wallet,
  Target,
  Settings,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COMMANDS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/employees", key: "employees", icon: Users },
  { href: "/attendance", key: "attendance", icon: Clock },
  { href: "/leave", key: "leave", icon: CalendarDays },
  { href: "/claims", key: "claims", icon: ReceiptText },
  { href: "/loans", key: "loans", icon: Landmark },
  { href: "/payroll", key: "payroll", icon: Wallet },
  { href: "/performance", key: "performance", icon: Target },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export function CommandCenter() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const t = useTranslations("nav");
  const inputRef = useRef<HTMLInputElement>(null);

  // Bind Ctrl+K and Cmd+K keydown listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter commands by query
  const filtered = COMMANDS.filter((cmd) => {
    const label = t(cmd.key).toLowerCase();
    return label.includes(query.toLowerCase());
  });

  // Reset selected item when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation inside the list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleNavigate(filtered[selectedIndex].href);
      }
    }
  };

  const handleNavigate = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0 overflow-hidden glass-panel border-white/20 shadow-elev-4">
        <div className="flex items-center border-b border-white/10 px-3.5 py-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-ink" />
          <Input
            ref={inputRef}
            placeholder="Type a command or search page..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex h-10 w-full rounded-md bg-transparent border-0 px-0 text-sm outline-none focus:ring-0 focus:border-0 text-ink placeholder:text-muted"
          />
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-muted opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
        
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-center text-muted">No commands found.</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((cmd, idx) => {
                const Icon = cmd.icon;
                const selected = idx === selectedIndex;
                return (
                  <button
                    key={cmd.href}
                    type="button"
                    onClick={() => handleNavigate(cmd.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3.5 py-2.5 text-sm font-medium transition-colors text-left cursor-pointer",
                      selected ? "bg-brand/10 text-brand" : "text-muted hover:bg-white/5 hover:text-ink"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span>{t(cmd.key)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
