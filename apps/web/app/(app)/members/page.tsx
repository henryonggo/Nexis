import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { revokeInvite } from "./actions";
import { InviteForm } from "./invite-form";
import type { CompanyRole, InviteStatus } from "@nexis/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface MemberJoin {
  role: CompanyRole;
  user_id: string;
  profiles: { full_name: string | null } | null;
}

const INVITE_ROLES = ["admin", "manager", "employee"] as const;
type InviteRole = (typeof INVITE_ROLES)[number];

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: { email?: string; role?: string };
}) {
  const supabase = createClient();
  const active = await getActiveCompany();
  if (!active) return null;
  const isAdmin = active.role === "owner" || active.role === "admin";
  const t = await getTranslations("members");
  const tRoles = await getTranslations("roles");

  const { data: members } = await supabase
    .from("company_members")
    .select("role, user_id, profiles(full_name)")
    .eq("company_id", active.id)
    .order("created_at", { ascending: true });

  const { data: invites } = isAdmin
    ? await supabase
        .from("invitations")
        .select("id, email, role, status, expires_at")
        .eq("company_id", active.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
    : { data: null };

  const memberRows = (members as unknown as MemberJoin[] | null) ?? [];
  const inviteRows =
    (invites as unknown as
      | { id: string; email: string; role: CompanyRole; status: InviteStatus; expires_at: string }[]
      | null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { name: active.name })}</p>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.role")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberRows.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell className="text-ink">{m.profiles?.full_name || t("noName")}</TableCell>
                <TableCell className="text-muted">{tRoles(m.role)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {isAdmin && (
        <>
          <InviteForm
            defaultEmail={searchParams?.email ?? ""}
            defaultRole={
              INVITE_ROLES.includes(searchParams?.role as InviteRole)
                ? (searchParams!.role as InviteRole)
                : "employee"
            }
          />

          {inviteRows.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("pendingInvites")}</h2>
              <Card className="overflow-hidden p-0">
                <Table>
                  <TableBody>
                    {inviteRows.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="text-ink">{i.email}</TableCell>
                        <TableCell className="text-muted">{tRoles(i.role)}</TableCell>
                        <TableCell className="text-right">
                          <form action={revokeInvite}>
                            <input type="hidden" name="id" value={i.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-danger hover:text-danger">
                              {t("revoke")}
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
