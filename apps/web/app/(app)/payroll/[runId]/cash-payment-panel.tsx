"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Wallet } from "lucide-react";
import { formatRupiah } from "@/lib/payroll-format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { confirmCashPaid } from "../actions";

export type CashLine = {
  itemId: string;
  name: string;
  net: number;
  paidAt: string | null;
  paidMethod: string | null;
};

export function CashPaymentPanel({ runId, lines }: { runId: string; lines: CashLine[] }) {
  const t = useTranslations("payroll.cash");
  // Default selection: the not-yet-paid employees.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(lines.filter((l) => !l.paidAt).map((l) => l.itemId)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const unpaid = lines.filter((l) => !l.paidAt);
  const allUnpaidSelected =
    unpaid.length > 0 && unpaid.every((l) => selected.has(l.itemId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allUnpaidSelected ? new Set() : new Set(unpaid.map((l) => l.itemId)));
  }

  async function confirm() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setError(null);
    setPending(true);
    const res = await confirmCashPaid(ids, runId, "cash");
    setPending(false);
    if (res.error) setError(res.error);
    else setSelected(new Set());
  }

  const paidCount = lines.filter((l) => l.paidAt).length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-brand" />
          <div>
            <h2 className="text-sm font-semibold text-ink">{t("title")}</h2>
            <p className="text-xs text-muted">{t("paidOf", { paid: paidCount, total: lines.length })}</p>
          </div>
        </div>
        <Button size="sm" disabled={pending || selected.size === 0} onClick={confirm}>
          <BadgeCheck className="mr-1.5 h-4 w-4" />
          {t("confirm", { count: selected.size })}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 space-y-1">
        {unpaid.length > 0 && (
          <label className="flex items-center gap-2 border-b border-border pb-2 text-xs text-muted">
            <Checkbox checked={allUnpaidSelected} onCheckedChange={toggleAll} />
            {t("selectAllUnpaid")}
          </label>
        )}
        {lines.map((l) => (
          <div key={l.itemId} className="flex items-center gap-3 py-1.5 text-sm">
            <Checkbox
              checked={selected.has(l.itemId)}
              disabled={Boolean(l.paidAt)}
              onCheckedChange={() => toggle(l.itemId)}
            />
            <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
            <span className="tabular-nums text-muted">{formatRupiah(l.net)}</span>
            {l.paidAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                <BadgeCheck className="h-3.5 w-3.5" />
                {l.paidMethod === "bank" ? t("paidBank") : t("paidCash")}
              </span>
            ) : (
              <span className="text-xs text-muted">{t("unpaid")}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
