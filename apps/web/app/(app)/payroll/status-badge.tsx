import type { Database } from "@nexis/types";

type Status = Database["public"]["Enums"]["pay_period_status"];

const LABELS: Record<Status, string> = {
  draft: "Draf",
  queued: "Antre",
  processing: "Diproses",
  completed: "Selesai",
  paid: "Dibayar",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

const STYLES: Record<Status, string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-600 text-white",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
