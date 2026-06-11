import type { ReactNode } from "react";

/**
 * Loading skeletons used by route-level `loading.tsx` files. Pure markup (no client
 * JS) so they stream instantly while the server component fetches data. Tokens match
 * the design system (`docs/06-design-system.md`); `animate-pulse` is disabled under
 * `prefers-reduced-motion`.
 */

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Title + subtitle, with an optional placeholder for a right-aligned action area. */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {action && <Skeleton className="h-9 w-36" />}
    </div>
  );
}

/** A grid of stat/summary cards (dashboard, analytics, billing). */
export function CardGridSkeleton({ count = 3, columns = 3 }: { count?: number; columns?: number }) {
  const colClass = columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3";
  return (
    <div className={`grid gap-4 ${colClass}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-[color:var(--border)] bg-white p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** A table with a header row and shimmering body rows. */
export function TableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-white">
      <div className="flex gap-4 bg-brand-light/60 px-4 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-[color:var(--border)]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stacked label + input pairs for create/edit forms. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="max-w-xl space-y-5 rounded-lg border border-[color:var(--border)] bg-white p-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/** Standard list-page shell: header above a table. Used by most loading.tsx files. */
export function ListPageSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <TableSkeleton columns={columns} rows={rows} />
    </div>
  );
}

/** Wrapper that matches the page content spacing for custom compositions. */
export function PageSkeleton({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
