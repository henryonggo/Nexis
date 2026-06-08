import { createClient } from "@/lib/supabase/server";
import { DeactivateSection } from "./deactivate-section";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Pengaturan</h1>
        <p className="text-sm text-muted">Kelola akun Anda.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Akun</h2>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <p className="text-sm text-muted">Email</p>
          <p className="font-medium text-ink">{user?.email ?? "—"}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Zona berbahaya</h2>
        <DeactivateSection />
      </section>
    </div>
  );
}
