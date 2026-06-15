"use client";

import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { approveJoinRequest, rejectJoinRequest, type MemberState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fieldClasses } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export interface JoinRequest {
  id: string;
  email: string;
}

const initial: MemberState = {};

export function JoinRequestsQueue({
  requests,
  canGrantAdmin,
}: {
  requests: JoinRequest[];
  canGrantAdmin: boolean;
}) {
  const t = useTranslations("members");

  if (requests.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-ink">{t("joinRequests")}</h2>
      <Card className="divide-y divide-border p-0">
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} canGrantAdmin={canGrantAdmin} />
        ))}
      </Card>
    </div>
  );
}

function RequestRow({ request, canGrantAdmin }: { request: JoinRequest; canGrantAdmin: boolean }) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const [approveState, approve] = useFormState(approveJoinRequest, initial);
  const [rejectState, reject] = useFormState(rejectJoinRequest, initial);
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{request.email}</span>
        <div className="flex items-center gap-2">
          <form action={approve} className="flex items-center gap-2">
            <input type="hidden" name="requestId" value={request.id} />
            <select name="role" defaultValue="employee" className={`${fieldClasses} h-8 w-auto`}>
              <option value="employee">{tRoles("employee")}</option>
              <option value="manager">{tRoles("manager")}</option>
              {canGrantAdmin && <option value="admin">{tRoles("admin")}</option>}
            </select>
            <Button type="submit" size="sm">{t("approve")}</Button>
          </form>
          <form action={reject}>
            <input type="hidden" name="requestId" value={request.id} />
            <Button type="submit" variant="ghost" size="sm" className="text-danger hover:text-danger">
              {t("reject")}
            </Button>
          </form>
        </div>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
