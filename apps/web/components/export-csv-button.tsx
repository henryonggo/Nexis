"use client";

import { buildCsv, type CsvCell } from "@/lib/csv";

/**
 * Downloads the given rows as a CSV file, generated entirely in the browser from
 * data already on the page. Use for quick exports of list views; heavy/official
 * exports go through the report worker.
 */
export function ExportCsvButton({
  filename,
  headers,
  rows,
  label = "Ekspor CSV",
}: {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
  label?: string;
}) {
  const disabled = rows.length === 0;

  function handleExport() {
    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
