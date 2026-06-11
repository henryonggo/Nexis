// Client-safe billing catalog & formatters (no server-only imports) so the client
// upgrade form can use PLANS/formatRupiah. Server-side data access and the upgrade
// validation schemas live in lib/billing.ts and re-export these.
import type { Database } from "@nexis/types";
import { formatRupiah } from "@nexis/money";

export type PlanTier = Database["public"]["Enums"]["plan_tier"];

export interface PlanMeta {
  id: PlanTier;
  label: string;
  /** Price per active seat per month, in integer rupiah. null = custom/contact sales. */
  pricePerSeat: number | null;
  /** Max active employees on this plan. null = unlimited. */
  seatCap: number | null;
  description: string;
  /** Short feature bullets for the plan-comparison cards. id-ID copy. */
  features: string[];
}

/** Plan catalog driving the billing page and upgrade form. id-ID copy. */
export const PLANS: PlanMeta[] = [
  {
    id: "free",
    label: "Gratis",
    pricePerSeat: 0,
    seatCap: 5,
    description: "Hingga 5 karyawan. Tanpa NPWP. Cocok untuk mencoba Nexis.",
    features: ["Hingga 5 karyawan", "Tanpa NPWP", "Absensi & cuti", "1 perusahaan"],
  },
  {
    id: "starter",
    label: "Starter",
    pricePerSeat: 25_000,
    seatCap: 25,
    description: "Hingga 25 karyawan. Payroll, BPJS, dan PPh 21 lengkap.",
    features: ["Hingga 25 karyawan", "Payroll otomatis", "BPJS & PPh 21 (TER)", "Slip gaji PDF"],
  },
  {
    id: "growth",
    label: "Growth",
    pricePerSeat: 45_000,
    seatCap: 100,
    description: "Hingga 100 karyawan. Semua laporan & ekspor pajak.",
    features: [
      "Hingga 100 karyawan",
      "Semua fitur Starter",
      "Ekspor e-Bupot & SIPP",
      "API & webhook",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    pricePerSeat: null,
    seatCap: null,
    description: "Tanpa batas karyawan, SSO, dan dukungan khusus. Hubungi kami.",
    features: ["Karyawan tanpa batas", "SSO/SCIM", "Dukungan khusus", "SLA & onboarding"],
  },
];

const PLAN_BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export function planMeta(id: PlanTier): PlanMeta {
  return PLAN_BY_ID.get(id) ?? PLANS[0]!;
}

/** Paid plans a company can self-upgrade to via the sandbox checkout. */
export const UPGRADEABLE_PLANS = PLANS.filter((p) => p.id !== "free" && p.id !== "enterprise");

/** Monthly cost estimate for a plan at a given active-seat count, in rupiah. */
export function estimateMonthlyCost(plan: PlanMeta, seats: number): number | null {
  if (plan.pricePerSeat == null) return null;
  return plan.pricePerSeat * Math.max(seats, 0);
}

/** Display NPWP grouped as 99.999.999.9-999.999 (16-digit shown as raw). */
export function formatNpwp(raw: string | null): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 15) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12, 15)}`;
}

export { formatRupiah };
