import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import {
  getAuditLog,
  actionLabel,
  actionTone,
  entityLabel,
  AUDIT_ENTITIES,
} from "@/lib/audit";

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

  const isAdmin = active.role === "owner" || active.role === "admin";
  if (!isAdmin) {
    return (
      <div className="nx-card max-w-lg">
        <h1 className="mb-1 text-xl font-bold text-ink">Audit & Kepatuhan</h1>
        <p className="text-sm text-muted">
          Hanya pemilik atau admin yang dapat melihat log audit.
        </p>
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
      <div>
        <h1 className="text-2xl font-bold text-ink">Audit & Kepatuhan</h1>
        <p className="text-sm text-muted">
          Catatan tindakan sensitif di {active.name} — persetujuan, penolakan, dan koreksi.
        </p>
      </div>

      {/* Entity filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="Semua" href="/audit" active={!activeEntity} />
        {AUDIT_ENTITIES.map((e) => (
          <FilterChip
            key={e}
            label={entityLabel(e)}
            href={`/audit?entity=${e}`}
            active={activeEntity === e}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Waktu</th>
              <th className="px-4 py-2 font-medium">Tindakan</th>
              <th className="px-4 py-2 font-medium">Objek</th>
              <th className="px-4 py-2 font-medium">Oleh</th>
              <th className="px-4 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Belum ada catatan audit.
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
                        {actionLabel(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">{entityLabel(entry.entity)}</td>
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
