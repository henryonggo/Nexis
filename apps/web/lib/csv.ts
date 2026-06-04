// Client-safe CSV helpers (no server-only imports) for quick in-browser exports
// of already-loaded tabular data. For heavy/server-rendered exports use the
// report worker (lib/reports.ts) instead.

export type CsvCell = string | number | null | undefined;

/** RFC-4180 escape: wrap in quotes when the value contains a quote, comma, or newline. */
function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from headers + rows. Prepends a UTF-8 BOM so Excel opens
 * Indonesian characters and rupiah correctly.
 */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return "﻿" + lines.join("\r\n");
}
