import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";
import { revokeInvite } from "./actions";
import { InviteForm } from "./invite-form";
import type { CompanyRole, InviteStatus } from "@nexis/types";

interface MemberJoin {
  role: CompanyRole;
  user_id: string;
  profiles: { full_name: string | null } | null;
}

export default async function MembersPage() {
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

      <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-light/60 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("columns.name")}</th>
              <th className="px-4 py-2 font-medium">{t("columns.role")}</th>
            </tr>
          </thead>
          <tbody>
            {memberRows.map((m) => (
              <tr key={m.user_id} className="border-t border-[color:var(--border)]">
                <td className="px-4 py-2 text-ink">{m.profiles?.full_name || t("noName")}</td>
                <td className="px-4 py-2 text-muted">{tRoles(m.role)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <>
          <InviteForm />

          {inviteRows.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("pendingInvites")}</h2>
              <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
                <table className="w-full text-sm">
                  <tbody>
                    {inviteRows.map((i) => (
                      <tr key={i.id} className="border-t border-[color:var(--border)] first:border-t-0">
                        <td className="px-4 py-2 text-ink">{i.email}</td>
                        <td className="px-4 py-2 text-muted">{tRoles(i.role)}</td>
                        <td className="px-4 py-2 text-right">
                          <form action={revokeInvite}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs text-danger hover:underline">{t("revoke")}</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
