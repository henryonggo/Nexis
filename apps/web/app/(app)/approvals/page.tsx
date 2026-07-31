import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/roles";
import { ICONS } from "@/lib/nav";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ClipboardCheck, Bot } from "lucide-react";
import { decideApprovalRequest } from "./actions";
import { AgentPanel } from "./agent-panel";
import { ApprovalStatusBadge } from "./status-badge";
import { AgentCycleStatusBadge } from "./cycle-status-badge";
import { describePayload, isRunIdPayload } from "./describe-payload";

// Orchestrator cycles make several model calls; give the server action room
// beyond the default serverless duration (Vercel caps by plan).
export const maxDuration = 300;

/**
 * The approval gate (PIVOT-PHASE-1: "agent proposes → owner confirms →
 * system executes") — Phase 1's only new UI surface. Lists agent-proposed
 * mutations from `approval_requests`; owner/admin approves or rejects. The
 * agent runtime consumes an approved request (single-use, payload-hash
 * bound) via packages/agent-tools when it re-runs the tool.
 */

export default async function ApprovalsPage() {
  const active = await getActiveCompany();
  if (!active) return null;
  const t = await getTranslations("approvals");
  const isAdmin = isAdminRole(active.role);

  const supabase = createClient();
  const [{ data }, { data: cycleData }] = await Promise.all([
    supabase
      .from("approval_requests")
      .select("id, tool_name, summary, payload, status, created_at, expires_at, decided_at")
      .eq("company_id", active.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("agent_cycles")
      .select("id, instruction, status, finished_at, halts, pending_request_ids")
      .eq("company_id", active.id)
      .order("finished_at", { ascending: false })
      .limit(20),
  ]);

  const requests = data ?? [];
  const cycles = cycleData ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");
  const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

  const now = new Date();
  const periodLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="space-y-6">
      <PageHeader icon={ICONS.approvals} title={t("title")} description={t("subtitle")} />

      {isAdmin && (
        <AgentPanel
          defaultInstruction={t("agent.defaultInstruction", { period: periodLabel })}
          approvedRequests={requests
            .filter((r) => r.status === "approved")
            .map((r) => ({ id: r.id, toolName: r.tool_name, summary: r.summary }))}
          labels={{
            title: t("agent.title"),
            description: t("agent.description"),
            instructionLabel: t("agent.instructionLabel"),
            run: t("agent.run"),
            running: t("agent.running"),
            resume: t("agent.resume"),
            statusLabel: t("agent.statusLabel"),
            status: {
              completed: t("agent.cycleStatus.completed"),
              awaiting_approval: t("agent.cycleStatus.awaiting_approval"),
              halted: t("agent.cycleStatus.halted"),
              refusal: t("agent.cycleStatus.refusal"),
              max_turns: t("agent.cycleStatus.max_turns"),
              error: t("agent.cycleStatus.error"),
            },
            haltsHeading: t("agent.haltsHeading"),
            approvalsHeading: t("agent.approvalsHeading"),
            auditGapsHeading: t("agent.auditGapsHeading"),
            auditGapsDescription: t("agent.auditGapsDescription"),
          }}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("pending")}</h2>
        {pending.length === 0 && (
          <Card className="p-5">
            <EmptyState icon={ClipboardCheck} title={t("empty")} />
          </Card>
        )}
        {pending.map((req) => {
          const readablePayload = describePayload(req.tool_name, req.payload, t);
          const compactPayload = isRunIdPayload(req.tool_name);
          return (
            <Card key={req.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">{req.tool_name}</span>
                    <ApprovalStatusBadge status={req.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {req.summary ?? t("noSummary")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t("requested")}: {fmt.format(new Date(req.created_at))} · {t("expires")}:{" "}
                    {fmt.format(new Date(req.expires_at))}
                  </p>
                  <p
                    className={
                      compactPayload ? "mt-2 font-mono text-xs text-muted" : "mt-2 text-sm text-ink"
                    }
                  >
                    {readablePayload}
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
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("agentHistory.title")}</h2>
        {cycles.length === 0 ? (
          <Card className="p-5">
            <EmptyState icon={Bot} title={t("agentHistory.empty")} />
          </Card>
        ) : (
          <Card className="divide-y p-0">
            {cycles.map((cycle) => {
              const haltCount = Array.isArray(cycle.halts) ? cycle.halts.length : 0;
              const pendingCount = cycle.pending_request_ids?.length ?? 0;
              return (
                <div key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{cycle.instruction}</p>
                    {(haltCount > 0 || pendingCount > 0) && (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                        {haltCount > 0 && (
                          <span>{t("agentHistory.haltsCount", { count: haltCount })}</span>
                        )}
                        {pendingCount > 0 && (
                          <span>{t("agentHistory.pendingCount", { count: pendingCount })}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <AgentCycleStatusBadge status={cycle.status} />
                    <span className="text-xs text-muted">
                      {fmt.format(new Date(cycle.finished_at))}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
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
                  <ApprovalStatusBadge status={req.status} />
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
