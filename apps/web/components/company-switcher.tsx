"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { ActiveCompany } from "@nexis/types";
import { setActiveCompany } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Company switcher backed by a server-set cookie (active company is read on the server). */
export function CompanySwitcher({
  companies,
  activeId,
}: {
  companies: ActiveCompany[];
  activeId: string;
}) {
  const tRoles = useTranslations("roles");
  const tc = useTranslations("common");
  const [isPending, setIsPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const active = companies.find((c) => c.id === activeId) ?? companies[0];
  if (!active) return null;

  function select(id: string) {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending || pending} className="gap-2">
          <span className="max-w-[10rem] truncate font-medium text-ink">{active.name}</span>
          <Badge variant="default">{tRoles(active.role)}</Badge>
          <ChevronsUpDown className="h-4 w-4 text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => select(c.id)} className="justify-between">
            <span className="flex items-center gap-2 truncate">
              <Check className={cn("h-4 w-4", c.id === active.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate text-ink">{c.name}</span>
            </span>
            <span className="text-xs text-muted">{tRoles(c.role)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/companies/new" className="font-medium text-brand">
            <Plus className="h-4 w-4" />
            {tc("addCompany")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
