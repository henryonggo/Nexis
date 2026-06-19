"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { formatPeriod, formatRupiah } from "@/lib/payroll-format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getPayslipDownloadUrls } from "./actions";

export type PayslipRow = {
  id: string;
  hasPdf: boolean;
  periodYear: number;
  periodMonth: number;
  netPay: number;
};

/** Opens each signed URL as a download. A small gap avoids the browser blocking
 *  rapid multi-file downloads. */
async function triggerDownloads(urls: { url: string }[]): Promise<void> {
  for (const { url } of urls) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.click();
    await new Promise((r) => setTimeout(r, 400));
  }
}

export function PayslipsList({ rows }: { rows: PayslipRow[] }) {
  const t = useTranslations("payslips");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const downloadable = rows.filter((r) => r.hasPdf);
  const allSelected = downloadable.length > 0 && selected.size === downloadable.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(downloadable.map((r) => r.id)));
  }

  function download(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await getPayslipDownloadUrls(ids);
      if (res.error || !res.urls) {
        setError(res.error ?? t("downloadError"));
        return;
      }
      await triggerDownloads(res.urls);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          {t("selectAll")}
        </label>
        <Button
          size="sm"
          disabled={pending || selected.size === 0}
          onClick={() => download([...selected])}
        >
          <Download className="mr-1.5 h-4 w-4" />
          {t("downloadSelected", { count: selected.size })}
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="divide-y divide-border p-0">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <Checkbox
              checked={selected.has(r.id)}
              disabled={!r.hasPdf}
              onCheckedChange={() => toggle(r.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">
                {formatPeriod(r.periodYear, r.periodMonth)}
              </div>
              <div className="text-xs text-muted">{formatRupiah(r.netPay)}</div>
            </div>
            {r.hasPdf ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => download([r.id])}
              >
                <Download className="mr-1.5 h-4 w-4" />
                {t("download")}
              </Button>
            ) : (
              <span className="text-xs text-muted">{t("notReady")}</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
