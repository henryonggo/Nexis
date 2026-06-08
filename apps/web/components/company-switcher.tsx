"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActiveCompany } from "@nexis/types";
import { setActiveCompany } from "@/app/(app)/actions";

const ROLE_LABEL: Record<ActiveCompany["role"], string> = {
  owner: "Pemilik",
  admin: "Admin",
  manager: "Manajer",
  employee: "Karyawan",
};

/** Company switcher backed by a server-set cookie (active company is read on the server). */
export function CompanySwitcher({
  companies,
  activeId,
}: {
  companies: ActiveCompany[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const active = companies.find((c) => c.id === activeId) ?? companies[0];
  if (!active) return null;

  function select(id: string) {
    setOpen(false);
    if (id === active!.id) return;
    setIsPending(true);
    setActiveCompany(id).then(() => {
      startTransition(() => {
        router.refresh();
        setIsPending(false);
      });
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending || pending}
        className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm hover:bg-brand-light disabled:opacity-60"
      >
        <span className="font-medium text-ink">{active.name}</span>
        <span className="rounded bg-brand-light px-1.5 py-0.5 text-xs text-brand-dark">
          {ROLE_LABEL[active.role]}
        </span>
        <span className="text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-64 rounded-md border border-[color:var(--border)] bg-white py-1 shadow-lg">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-light ${
                c.id === active.id ? "bg-brand-light" : ""
              }`}
            >
              <span className="text-ink">{c.name}</span>
              <span className="text-xs text-muted">{ROLE_LABEL[c.role]}</span>
            </button>
          ))}
          <Link
            href="/companies/new"
            onClick={() => setOpen(false)}
            className="mt-1 flex w-full items-center gap-1 border-t border-[color:var(--border)] px-3 py-2 text-left text-sm font-medium text-brand hover:bg-brand-light"
          >
            + Tambah perusahaan
          </Link>
        </div>
      )}
    </div>
  );
}
