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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}

const LOG_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  delivered: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
};

export default async function DeveloperPage() {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("developer");
  const isOwnerAdmin = active.role === "owner" || active.role === "admin";
  if (!isOwnerAdmin) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </div>
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
        <div className="nx-card">
          <h2 className="mb-3 text-lg font-semibold text-ink">{t("keys", { count: keys.length })}</h2>
          {keys.length === 0 ? (
            <p className="text-sm text-muted">{t("noKeys")}</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {k.name}{" "}
                      {!k.isActive && <span className="text-xs text-red-600">{t("revoked")}</span>}
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
        </div>
      </div>

      {/* ── Webhooks ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <WebhookForm />
        <div className="nx-card">
          <h2 className="mb-3 text-lg font-semibold text-ink">{t("webhooks", { count: webhooks.length })}</h2>
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted">{t("noWebhooks")}</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {webhooks.map((w) => (
                <li key={w.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{w.url}</p>
                      <p className="truncate text-xs text-muted">{w.events.join(", ")}</p>
                      <p className="text-xs">
                        {w.isActive ? (
                          <span className="text-emerald-700">{t("active")}</span>
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
        </div>
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
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-light/60 text-left text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">{t("deliveryColumns.time")}</th>
            <th className="px-4 py-2 font-medium">{t("deliveryColumns.event")}</th>
            <th className="px-4 py-2 font-medium">{t("deliveryColumns.status")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("deliveryColumns.http")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("deliveryColumns.attempt")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted">
                {t("noDeliveries")}
              </td>
            </tr>
          ) : (
            rows.map((l) => (
              <tr key={l.id} className="border-t border-[color:var(--border)]">
                <td className="px-4 py-3 text-muted">{fmtDate(l.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink">{l.eventType}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      LOG_STYLES[l.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {l.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {l.responseStatus ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">{l.attemptNumber}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
