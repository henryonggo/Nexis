// Pure navigation config + helpers. Deliberately NOT a "use client" module so
// Server Components (e.g. the app layout) can import these runtime VALUES
// directly. Importing them from the "use client" app-sidebar instead resolves
// to client-reference stubs in production, so runtime VALUES (not just types)
// are undefined at render — see the regression fixed alongside this file.
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  ClipboardCheck,
  ReceiptText,
  Landmark,
  Scissors,
  Coins,
  FileDown,
  Wallet,
  FileText,
  CreditCard,
  ScrollText,
  UserCog,
  ShieldCheck,
  Settings,
  ShieldAlert,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; key: string; label: string };

/** Per-nav-item icon, keyed by the item `key`. */
export const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  profile: UserCircle,
  employees: Users,
  attendance: Clock,
  leave: CalendarDays,
  claims: ReceiptText,
  loans: Landmark,
  earnings: Coins,
  deductions: Scissors,
  payslips: FileDown,
  payroll: Wallet,
  approvals: ClipboardCheck,
  reports: FileText,
  billing: CreditCard,
  audit: ScrollText,
  members: UserCog,
  access: ShieldCheck,
  superadmin: ShieldAlert,
  settings: Settings,
};

/** Sidebar sections, in display order. `main` is rendered without a title. */
export const NAV_GROUPS = ["main", "team", "pay", "company"] as const;
export type NavGroupKey = (typeof NAV_GROUPS)[number];

export type NavGroup = { key: NavGroupKey; label: string | null; items: NavItem[] };
