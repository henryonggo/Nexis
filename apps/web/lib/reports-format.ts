// Client-safe report metadata (no server-only imports) so the client report form
// can use REPORT_TYPES. Server-side data access lives in lib/reports.ts and
// re-exports these.

/** Report types the payroll worker can render (see services/payroll-worker `/process-report`). */
export type ReportType = "payroll_summary" | "bpjs_contribution" | "pph21_ebupot" | "bpjs_sipp";

export type ReportJobStatus = "pending" | "processing" | "completed" | "failed";

export interface ReportTypeMeta {
  type: ReportType;
  label: string;
  description: string;
}

/** Catalog driving the generate form and the job-row labels. id-ID copy. */
export const REPORT_TYPES: ReportTypeMeta[] = [
  {
    type: "payroll_summary",
    label: "Ringkasan Payroll",
    description: "Rekap bruto, potongan, BPJS, PPh 21, dan neto per karyawan untuk satu run.",
  },
  {
    type: "bpjs_contribution",
    label: "Iuran BPJS",
    description: "Rincian iuran BPJS Kesehatan & Ketenagakerjaan, sisi karyawan dan perusahaan.",
  },
  {
    type: "pph21_ebupot",
    label: "PPh 21 / e-Bupot",
    description: "Ekspor pemotongan PPh 21 dalam format yang siap untuk rekonsiliasi e-Bupot DJP.",
  },
  {
    type: "bpjs_sipp",
    label: "BPJS SIPP",
    description: "Format upah & iuran untuk diunggah ke aplikasi SIPP BPJS Ketenagakerjaan.",
  },
];

const REPORT_LABELS: Record<ReportType, string> = Object.fromEntries(
  REPORT_TYPES.map((r) => [r.type, r.label]),
) as Record<ReportType, string>;

export function reportTypeLabel(type: string): string {
  return REPORT_LABELS[type as ReportType] ?? type;
}
