import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { ExportCsvButton } from "@/components/export-csv-button";
import { getAuditLog, actionTone, AUDIT_ENTITIES } from "@/lib/audit";
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

const KNOWN_ACTIONS = new Set([
  "approve_leave",
  "reject_leave",
  "approve_claim",
  "reject_claim",
  "correct_attendance",
]);

const TONE_VARIANT: Record<"approve" | "reject" | "neutral", "success" | "destructive" | "secondary"> = {
  approve: "success",
  reject: "destructive",
  neutral: "secondary",
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
      <Card className="max-w-lg p-8">
        <h1 className="mb-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("noAccess")}</p>
      </Card>
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

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.time")}</TableHead>
              <TableHead>{t("columns.action")}</TableHead>
              <TableHead>{t("columns.object")}</TableHead>
              <TableHead>{t("columns.by")}</TableHead>
              <TableHead>{t("columns.detail")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const detail = summarizeMetadata(entry.metadata);
                return (
                  <TableRow key={entry.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted">
                      {DATE_FMT.format(new Date(entry.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TONE_VARIANT[actionTone(entry.action)]}>
                        {actLabel(entry.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink">{entLabel(entry.entity)}</TableCell>
                    <TableCell className="text-ink">{entry.actorName}</TableCell>
                    <TableCell className="max-w-xs text-xs text-muted">{detail ?? "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
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
          : "border-border bg-white text-ink hover:bg-brand-light"
      }`}
    >
      {label}
    </Link>
  );
}
