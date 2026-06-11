import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { ExportCsvButton } from "@/components/export-csv-button";
import { getAuditLog, actionTone, AUDIT_ENTITIES } from "@/lib/audit";

const KNOWN_ACTIONS = new Set([
  "approve_leave",
  "reject_leave",
  "approve_claim",
  "reject_claim",
  "correct_attendance",
]);

const TONE_STYLES: Record<"approve" | "reject" | "neutral", string> = {
  approve: "bg-emerald-100 text-emerald-700",
  reject: "bg-red-100 text-red-700",
  neutral: "bg-gray-100 text-gray-700",
};

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Compact one-line summary of an audit entry's metadata jsonb. */
function summarizeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return entries.length ? entries.join(" · ") : null;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { entity?: string };
}) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;

  const t = await getTranslations("audit");
  const tActions = await getTranslations("audit.actions");
  const tEntities = await getTranslations("audit.entities");
  const actLabel = (a: string) =>
    KNOWN_ACTIONS.has(a) ? tActions(a) : a.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const entLabel = (e: string | null) =>
    !e ? "—" : (AUDIT_ENTITIES as readonly string[]).includes(e) ? tEntities(e) : e;

  const isAdmin = active.role === "owner" || active.role === "admin";
  if (!isAdmin) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </div>
    );
  }

  const activeEntity =
    searchParams.entity && AUDIT_ENTITIES.includes(searchParams.entity as never)
      ? searchParams.entity
      : undefined;

  const entries = await getAuditLog(supabase, active.id, { entity: activeEntity });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
        </div>
        <ExportCsvButton
          filename={`audit-${active.name}`}
          headers={["Waktu", "Tindakan", "Objek", "Oleh", "Detail"]}
          rows={entries.map((entry) => [
            entry.createdAt,
            actLabel(entry.action),
            entLabel(entry.entity),
            entry.actorName,
            summarizeMetadata(entry.metadata) ?? "",
          ])}
        />
      </div>

      {/* Entity filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label={t("all")} href="/audit" active={!activeEntity} />
        {AUDIT_ENTITIES.map((e) => (
          <FilterChip
            key={e}
            label={entLabel(e)}
            href={`/audit?entity=${e}`}
            active={activeEntity === e}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("columns.time")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.action")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.object")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.by")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.detail")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const detail = summarizeMetadata(entry.metadata);
                return (
                  <tr key={entry.id} className="border-t border-[color:var(--border)] align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {DATE_FMT.format(new Date(entry.createdAt))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_STYLES[actionTone(entry.action)]}`}
                      >
                        {actLabel(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">{entLabel(entry.entity)}</td>
                    <td className="px-4 py-3 text-ink">{entry.actorName}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-muted">{detail ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active
          ? "border-brand bg-brand text-white"
          : "border-[color:var(--border)] bg-white text-ink hover:bg-brand-light"
      }`}
    >
      {label}
    </Link>
  );
}
