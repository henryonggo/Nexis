"use server";

import { acceptInvite as acceptInviteCore } from "@/lib/actions/invitations";

export type AcceptState = { error?: string };

export async function acceptInvite(token: string): Promise<AcceptState> {
  return acceptInviteCore(token);
}
