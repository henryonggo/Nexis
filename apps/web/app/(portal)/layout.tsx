import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { IdleTimeout } from "@/components/idle-timeout";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";

/**
 * Thin shell for the cross-company portal. Unlike the (app) layout it has no
 * active company, no pillar nav, and no company switcher — it sits above
 * tenancy. Auth guard only; the page itself decides what to do per membership count.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const t = await getTranslations("portal");
  const tc = await getTranslations("common");

  return (
    <div className="min-h-screen">
      <IdleTimeout />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between glass-panel border-t-0 border-x-0 rounded-none px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand">Nexis</span>
          <span className="text-sm text-muted">/ {t("title")}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className="hidden text-sm text-muted hover:text-brand sm:inline transition-colors font-medium"
          >
            {user.email}
          </Link>
          <LocaleSwitcher />
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              {tc("signOut")}
            </Button>
          </form>
        </div>
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
