"use client";

import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ExportRow {
  section: string;
  label: string;
  value: string | number;
}

/** Client-side CSV download of the assembled analytics rows. No server round-trip. */
export function ExportButton({
  rows,
  filename,
}: {
  rows: ExportRow[];
  filename: string;
}) {
  const t = useTranslations("analytics");

  function toCsv(): string {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Section", "Label", "Value"].join(",");
    const body = rows.map((r) => [r.section, r.label, r.value].map(esc).join(","));
    return [header, ...body].join("\n");
  }

  function onClick() {
    const blob = new Blob([toCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Download className="h-4 w-4" />
      {t("export")}
    </Button>
  );
}
