import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvite } from "./accept";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?redirectTo=/invite/${params.token}`);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold text-brand">Nexis</div>
        <p className="mt-1 text-sm text-muted">Undangan bergabung</p>
      </div>
      <div className="nx-card">
        <h1 className="mb-2 text-xl font-bold text-ink">Terima undangan</h1>
        <p className="mb-5 text-sm text-muted">
          Anda masuk sebagai <strong>{user.email}</strong>. Terima undangan untuk bergabung dengan
          perusahaan ini.
        </p>
        <AcceptInvite token={params.token} />
      </div>
    </main>
  );
}
