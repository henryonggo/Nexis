import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { decideApprovalRequest } from "./actions";

/**
 * The approval gate (PIVOT-PHASE-1: "agent proposes → owner confirms →
 * system executes") — Phase 1's only new UI surface. Lists agent-proposed
 * mutations from `approval_requests`; owner/admin approves or rejects. The
 * agent runtime consumes an approved request (single-use, payload-hash
 * bound) via packages/agent-tools when it re-runs the tool.
 */

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  consumed: "bg-slate-200 text-slate-700",
  expired: "bg-slate-100 text-slate-500",
};

export default async function ApprovalsPage() {
  const active = await getActiveCompany();
  if (!active) return null;
  const t = await getTranslations("approvals");
  const isAdmin = active.role === "owner" || active.role === "admin";

  const supabase = createClient();
  const { data } = await supabase
    .from("approval_requests")
    .select("id, tool_name, summary, payload, status, created_at, expires_at, decided_at")
    .eq("company_id", active.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");
  const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <PageHeader icon={ICONS.approvals} title={t("title")} description={t("subtitle")} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("pending")}</h2>
        {pending.length === 0 && (
          <Card className="p-5 text-center text-sm text-muted">{t("empty")}</Card>
        )}
        {pending.map((req) => (
          <Card key={req.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{req.tool_name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[req.status]}`}>
                    {t(`status.${req.status}`)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-ink">
                  {req.summary ?? t("noSummary")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t("requested")}: {fmt.format(new Date(req.created_at))} · {t("expires")}:{" "}
                  {fmt.format(new Date(req.expires_at))}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted">{t("payload")}</summary>
                  <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-slate-50 p-2 text-xs">
                    {JSON.stringify(req.payload, null, 2)}
                  </pre>
                </details>
              </div>
              {isAdmin ? (
                <div className="flex shrink-0 gap-2">
                  <form action={decideApprovalRequest}>
                    <input type="hidden" name="id" value={req.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <Button type="submit" size="sm">
                      {t("approve")}
                    </Button>
                  </form>
                  <form action={decideApprovalRequest}>
                    <input type="hidden" name="id" value={req.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button type="submit" size="sm" variant="outline">
                      {t("reject")}
                    </Button>
                  </form>
                </div>
              ) : (
                <p className="text-xs text-muted">{t("notAdmin")}</p>
              )}
            </div>
          </Card>
        ))}
      </section>

      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">{t("history")}</h2>
          <Card className="divide-y p-0">
            {decided.map((req) => (
              <div key={req.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted">{req.tool_name}</span>
                  <p className="truncate text-sm text-ink">{req.summary ?? t("noSummary")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[req.status] ?? ""}`}>
                    {t(`status.${req.status}`)}
                  </span>
                  <span className="text-xs text-muted">
                    {fmt.format(new Date(req.decided_at ?? req.created_at))}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
