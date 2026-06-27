"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Users, AlertTriangle, ChevronRight } from "lucide-react";
import { formatRupiah } from "@nexis/money";
import { formatPeriod } from "@/lib/payroll-format";
import type { PortalCompanySummary } from "@/lib/portal";
import { StatusBadge } from "@/app/(app)/payroll/status-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { switchAndOpen } from "../actions";

function CompanyCard({ c }: { c: PortalCompanySummary }) {
  const t = useTranslations("portal");
  const tRoles = useTranslations("roles");
  const tPlans = useTranslations("plans");

  return (
    <Card
      className={`flex flex-col gap-3 p-5 ${c.needsAction ? "border-warning/50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{c.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{tRoles(c.role)}</Badge>
            <Badge variant="secondary">{tPlans(c.plan)}</Badge>
            {c.needsAction && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      </div>

      {c.loadError ? (
        <p className="text-xs text-danger">{t("card.loadError")}</p>
      ) : (
        <dl className="space-y-1.5 text-sm">
          {c.headcount != null && (
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-muted">
                <Users className="h-4 w-4" />
              </dt>
              <dd className="font-medium text-ink">
                {c.seatLimit != null
                  ? t("card.seats", { used: c.activeSeats ?? c.headcount, limit: c.seatLimit })
                  : t("card.headcount", { count: c.headcount })}
              </dd>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">{t("card.lastPayroll")}</dt>
            <dd className="text-right">
              {c.lastPayroll ? (
                <span className="flex items-center justify-end gap-2">
                  <span className="text-ink">
                    {formatPeriod(c.lastPayroll.periodYear, c.lastPayroll.periodMonth)}
                  </span>
                  <StatusBadge status={c.lastPayroll.status as never} />
                </span>
              ) : (
                <span className="text-muted">{t("card.noPayroll")}</span>
              )}
            </dd>
          </div>

          {c.lastPayroll && c.lastPayroll.totalNet > 0 && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">{t("kpi.payrollTotal")}</dt>
              <dd className="font-medium text-ink">{formatRupiah(c.lastPayroll.totalNet)}</dd>
            </div>
          )}

          {c.pendingApprovals != null && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">{t("card.pendingApprovals")}</dt>
              <dd className={c.pendingApprovals > 0 ? "font-medium text-warning" : "text-muted"}>
                {c.pendingApprovals > 0 ? c.pendingApprovals : t("card.noPending")}
              </dd>
            </div>
          )}
        </dl>
      )}

      <form action={switchAndOpen} className="mt-auto pt-1">
        <input type="hidden" name="companyId" value={c.id} />
        <Button type="submit" size="sm" className="w-full gap-1">
          {t("card.open")}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}

export function PortalGrid({ companies }: { companies: PortalCompanySummary[] }) {
  const t = useTranslations("portal");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">{t("noMatches")}</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CompanyCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
