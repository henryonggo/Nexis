import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getApiKeys,
  getWebhooks,
  getWebhookLogs,
  type WebhookLogView,
} from "@/lib/developer";
import { KeyForm } from "./key-form";
import { WebhookForm } from "./webhook-form";
import { RevokeKeyButton, ToggleWebhookButton, DeleteWebhookButton } from "./row-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}

const LOG_VARIANT: Record<string, "success" | "destructive" | "warning"> = {
  success: "success",
  delivered: "success",
  failed: "destructive",
  pending: "warning",
};

export default async function DeveloperPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("developer");
  const isOwnerAdmin = active.role === "owner" || active.role === "admin";
  if (!isOwnerAdmin) {
    return (
      <Card className="max-w-lg p-8">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </Card>
    );
  }

  const [keys, webhooks, logs] = await Promise.all([
    getApiKeys(supabase, active.id),
    getWebhooks(supabase, active.id),
    getWebhookLogs(supabase, active.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      {/* ── API keys ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <KeyForm />
        <Card className="p-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">{t("keys", { count: keys.length })}</h2>
          {keys.length === 0 ? (
            <p className="text-sm text-muted">{t("noKeys")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {k.name}{" "}
                      {!k.isActive && <span className="text-xs text-danger">{t("revoked")}</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {k.scopes.join(", ") || t("noScope")} · {t("createdAt", { date: fmtDate(k.createdAt) })}
                    </p>
                    <p className="text-xs text-muted">{t("lastUsed", { date: fmtDate(k.lastUsedAt) })}</p>
                  </div>
                  {k.isActive && <RevokeKeyButton keyId={k.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Webhooks ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <WebhookForm />
        <Card className="p-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">{t("webhooks", { count: webhooks.length })}</h2>
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted">{t("noWebhooks")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {webhooks.map((w) => (
                <li key={w.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{w.url}</p>
                      <p className="truncate text-xs text-muted">{w.events.join(", ")}</p>
                      <p className="text-xs">
                        {w.isActive ? (
                          <span className="text-success">{t("active")}</span>
                        ) : (
                          <span className="text-muted">{t("inactive")}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <ToggleWebhookButton webhookId={w.id} isActive={w.isActive} />
                      <DeleteWebhookButton webhookId={w.id} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Delivery log ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t("deliveries")}
        </h2>
        <DeliveryTable rows={logs} />
      </section>
    </div>
  );
}

async function DeliveryTable({ rows }: { rows: WebhookLogView[] }) {
  const t = await getTranslations("developer");
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("deliveryColumns.time")}</TableHead>
            <TableHead>{t("deliveryColumns.event")}</TableHead>
            <TableHead>{t("deliveryColumns.status")}</TableHead>
            <TableHead className="text-right">{t("deliveryColumns.http")}</TableHead>
            <TableHead className="text-right">{t("deliveryColumns.attempt")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted">
                {t("noDeliveries")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-muted">{fmtDate(l.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs text-ink">{l.eventType}</TableCell>
                <TableCell>
                  <Badge variant={LOG_VARIANT[l.status] ?? "secondary"}>{l.status}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-ink">
                  {l.responseStatus ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted">{l.attemptNumber}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
