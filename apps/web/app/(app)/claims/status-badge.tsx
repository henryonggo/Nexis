import type { Database } from "@nexis/types";

type Status = Database["public"]["Enums"]["claim_status"];

const LABELS: Record<Status, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  paid: "Dibayar",
};

const STYLES: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-emerald-600 text-white",
};

export function ClaimStatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
