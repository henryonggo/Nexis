"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";
import { formatRupiah } from "@nexis/money";
import { type ClaimView } from "@/lib/claims";
import { approveClaimsBulk, rejectClaimsBulk } from "./actions";
import { ClaimDecisionButtons } from "./decision-buttons";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PendingClaimsListProps {
  pending: ClaimView[];
  canApprove: boolean;
  receiptUrls: Record<string, string>;
}

export function PendingClaimsList({
  pending,
  canApprove,
  receiptUrls,
}: PendingClaimsListProps) {
  const t = useTranslations("claims");
  const td = useTranslations("decision");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(pending.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleBulkApprove = () => {
    if (selectedIds.length === 0) return;
    approveClaimsBulk(selectedIds).then((res) => {
      startTransition(() => {
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(td("bulkSuccess"));
          setSelectedIds([]);
        }
      });
    });
  };

  const handleBulkReject = () => {
    if (selectedIds.length === 0) return;
    rejectClaimsBulk(selectedIds, rejectNote).then((res) => {
      startTransition(() => {
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(td("bulkSuccess"));
          setSelectedIds([]);
          setRejectNote("");
        }
      });
    });
  };

  if (pending.length === 0) {
    return <Card className="px-4 py-6 text-center text-sm text-muted">{t("noPending")}</Card>;
  }

  const allSelected = selectedIds.length === pending.length;
  const someSelected = selectedIds.length > 0;

  return (
    <div className="space-y-3 pb-24">
      {canApprove && (
        <div className="flex items-center gap-2 px-1 py-1">
          <Checkbox
            id="select-all-claims"
            checked={allSelected}
            onCheckedChange={(checked) => handleSelectAll(!!checked)}
            disabled={isPending}
          />
          <label
            htmlFor="select-all-claims"
            className="text-xs font-semibold uppercase tracking-wider text-muted cursor-pointer select-none"
          >
            Pilih semua ({pending.length})
          </label>
        </div>
      )}

      <div className="space-y-3">
        {pending.map((c) => {
          const isChecked = selectedIds.includes(c.id);
          return (
            <Card
              key={c.id}
              className={`p-4 transition-all duration-200 ${
                isChecked ? "ring-1 ring-brand/30 bg-brand/5" : ""
              }`}
            >
              <div className="flex items-start gap-3.5">
                {canApprove && (
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => handleSelectOne(c.id, !!checked)}
                    className="mt-1"
                    disabled={isPending}
                  />
                )}
                <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{c.employeeName}</p>
                    <p className="text-sm text-muted">
                      {c.claimTypeName} ·{" "}
                      <span className="font-semibold text-ink font-mono tabular-nums">
                        {formatRupiah(c.amount)}
                      </span>
                      {c.taxable ? ` · ${t("taxable")}` : ` · ${t("nonTaxable")}`}
                    </p>
                    {c.description && <p className="mt-1 text-sm text-ink">“{c.description}”</p>}
                    {receiptUrls[c.id] && (
                      <a
                        href={receiptUrls[c.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm text-brand hover:underline"
                      >
                        {t("viewReceipt")}
                      </a>
                    )}
                  </div>
                  {canApprove && !someSelected && <ClaimDecisionButtons claimId={c.id} />}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Floating Bulk Action Bar */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl transition-all duration-300 ease-in-out ${
          someSelected
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-12 opacity-0 pointer-events-none"
        }`}
      >
        <div className="glass-panel border-white/20 dark:border-slate-800/40 shadow-elev-4 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/45 dark:bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
            <span className="text-sm font-semibold text-ink">
              {td("selectedItems", { count: selectedIds.length })}
            </span>
          </div>

          <div className="flex flex-1 w-full sm:w-auto items-center justify-end gap-2.5">
            <Input
              type="text"
              placeholder={td("rejectReason")}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className="h-9 text-xs max-w-[180px] bg-white/10 border-white/20 text-ink placeholder:text-muted focus-visible:ring-brand/30"
              disabled={isPending}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkReject}
              disabled={isPending}
              className="h-9 px-3 gap-1.5 border-white/20 text-ink hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              <span className="hidden xs:inline">{td("reject")}</span>
            </Button>

            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={isPending}
              className="h-9 px-3 gap-1.5 bg-brand hover:bg-brand/90 text-white shadow-sm transition-colors"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>{td("approve")}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
