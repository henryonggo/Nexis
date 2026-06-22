// Pure navigation config + helpers. Deliberately NOT a "use client" module so
// Server Components (e.g. the app layout) can import these runtime VALUES
// directly. Importing them from the "use client" app-sidebar instead resolves
// to client-reference stubs in production, so PILLARS.filter(...) throws at
// render — see the regression fixed alongside this file.
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  ReceiptText,
  Landmark,
  Scissors,
  Coins,
  FileDown,
  Wallet,
  Target,
  BarChart3,
  FileText,
  CreditCard,
  ScrollText,
  Code2,
  UserCog,
  ShieldCheck,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; key: string; label: string };

/** Per-nav-item icon, keyed by the item `key`. */
export const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  employees: Users,
  attendance: Clock,
  leave: CalendarDays,
  claims: ReceiptText,
  loans: Landmark,
  earnings: Coins,
  deductions: Scissors,
  payslips: FileDown,
  payroll: Wallet,
  performance: Target,
  analytics: BarChart3,
  reports: FileText,
  billing: CreditCard,
  audit: ScrollText,
  developer: Code2,
  members: UserCog,
  access: ShieldCheck,
  settings: Settings,
};

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
  finance: ["payroll", "payslips", "claims", "loans", "earnings", "deductions", "billing"],
  platform: ["access", "developer", "settings"],
};

export function getActivePillar(pathname: string): string {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/analytics") || pathname.startsWith("/reports") || pathname.startsWith("/audit")) return "overview";
  if (pathname.startsWith("/employees") || pathname.startsWith("/members")) return "people";
  if (pathname.startsWith("/attendance") || pathname.startsWith("/leave") || pathname.startsWith("/performance")) return "operations";
  if (pathname.startsWith("/payroll") || pathname.startsWith("/payslips") || pathname.startsWith("/claims") || pathname.startsWith("/loans") || pathname.startsWith("/earnings") || pathname.startsWith("/deductions") || pathname.startsWith("/billing")) return "finance";
  if (pathname.startsWith("/developer") || pathname.startsWith("/settings")) return "platform";
  return "overview";
}
