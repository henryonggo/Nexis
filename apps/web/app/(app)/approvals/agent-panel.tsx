"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runAgentCycle, type AgentCycleState } from "./actions";

/**
 * The "run the agent" panel on the approval gate. One form starts a cycle;
 * approved-but-unconsumed requests get a resume form that re-invokes the tool
 * with the approval as its single-use token. Labels come from the server
 * component (next-intl stays server-side).
 */

export interface AgentPanelLabels {
  title: string;
  description: string;
  instructionLabel: string;
  run: string;
  running: string;
  resume: string;
  statusLabel: string;
  status: Record<string, string>;
  haltsHeading: string;
  approvalsHeading: string;
}

export interface ApprovedRequestProp {
  id: string;
  toolName: string;
  summary: string | null;
}

function SubmitButton({
  label,
  pendingLabel,
  variant,
  size,
}: {
  label: string;
  pendingLabel: string;
  variant?: "outline";
  size?: "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AgentPanel({
  labels,
  defaultInstruction,
  approvedRequests,
}: {
  labels: AgentPanelLabels;
  defaultInstruction: string;
  approvedRequests: ApprovedRequestProp[];
}) {
  const [state, formAction] = useFormState<AgentCycleState, FormData>(runAgentCycle, {});

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{labels.title}</h2>
      <p className="mt-1 text-sm text-muted">{labels.description}</p>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1">
          <span className="text-xs text-muted">{labels.instructionLabel}</span>
          <Input
            name="instruction"
            defaultValue={defaultInstruction}
            className="mt-1"
            maxLength={500}
          />
        </label>
        <SubmitButton label={labels.run} pendingLabel={labels.running} />
      </form>

      {approvedRequests.length > 0 && (
        <div className="mt-4 space-y-2">
          {approvedRequests.map((req) => (
            <form
              key={req.id}
              action={formAction}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 p-3"
            >
              <div className="min-w-0">
                <span className="font-mono text-xs text-muted">{req.toolName}</span>
                <p className="truncate text-sm text-ink">{req.summary}</p>
              </div>
              <input type="hidden" name="resumeRequestId" value={req.id} />
              <input type="hidden" name="resumeTool" value={req.toolName} />
              <input
                type="hidden"
                name="instruction"
                value={`Lanjutkan siklus payroll: jalankan ${req.toolName} yang sudah disetujui.`}
              />
              <SubmitButton
                label={labels.resume}
                pendingLabel={labels.running}
                variant="outline"
                size="sm"
              />
            </form>
          ))}
        </div>
      )}

      {state.error && (
        <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.result && (
        <div className="mt-3 space-y-2 rounded bg-slate-50 p-3">
          <p className="text-xs text-muted">
            {labels.statusLabel}:{" "}
            <span className="font-medium text-ink">
              {labels.status[state.result.status] ?? state.result.status}
            </span>
          </p>
          {state.result.finalText && (
            <p className="whitespace-pre-wrap text-sm text-ink">{state.result.finalText}</p>
          )}
          {state.result.halts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink">{labels.haltsHeading}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                {state.result.halts.map((h, i) => (
                  <li key={`${h.code}-${i}`}>
                    {h.message}
                    {h.needs ? ` (${h.needs})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.result.pendingApprovals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink">{labels.approvalsHeading}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                {state.result.pendingApprovals.map((p) => (
                  <li key={p.requestId}>{p.summary}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
