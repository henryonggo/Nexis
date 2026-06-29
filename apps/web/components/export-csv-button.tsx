"use client";

import { type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
  label,
  icon: Icon,
}: {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
  label?: string;
  icon?: LucideIcon;
}) {
  const t = useTranslations("common");
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

  const buttonContent = (
    <>
      {Icon && <Icon className="w-4 h-4" />}
      <span>{label ?? t("exportCsv")}</span>
    </>
  );

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      className={`rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? "flex items-center gap-2" : ""}`}
    >
      {buttonContent}
    </button>
  );
}
