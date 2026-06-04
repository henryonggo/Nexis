import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getActiveCompany } from "@/lib/company";
import { signOut } from "../(auth)/actions";
import { CompanySwitcher } from "@/components/company-switcher";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Karyawan" },
  { href: "/attendance", label: "Kehadiran" },
  { href: "/leave", label: "Cuti" },
  { href: "/claims", label: "Klaim" },
  { href: "/payroll", label: "Penggajian" },
  { href: "/members", label: "Anggota" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  const active = await getActiveCompany(memberships);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[color:var(--border)] bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-brand">Nexis</span>
          <CompanySwitcher companies={memberships} activeId={active!.id} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{user.email}</span>
          <form action={signOut}>
            <button className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm text-ink hover:bg-brand-light">
              Keluar
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <nav className="w-44 shrink-0 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-brand-light"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
