import type { ReportJobStatus } from "@/lib/reports-format";

const LABELS: Record<ReportJobStatus, string> = {
  pending: "Antre",
  processing: "Diproses",
  completed: "Selesai",
  failed: "Gagal",
};

const STYLES: Record<ReportJobStatus, string> = {
  pending: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function ReportStatusBadge({ status }: { status: ReportJobStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
