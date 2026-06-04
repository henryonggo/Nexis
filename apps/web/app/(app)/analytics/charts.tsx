import { formatRupiah } from "@nexis/money";
import type { NamedCount, PayrollPeriodPoint } from "@/lib/analytics";

/** Horizontal bar list — a labelled value with a proportional fill. */
export function BarList({
  items,
  emptyText,
  unit,
}: {
  items: NamedCount[];
  emptyText: string;
  unit?: string;
}) {
  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted">{emptyText}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-0.5 flex items-baseline justify-between text-sm">
            <span className="truncate text-ink">{item.label}</span>
            <span className="ml-2 shrink-0 tabular-nums font-medium text-ink">
              {item.value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-light">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bars for the payroll cost trend (gross per period). */
export function TrendChart({ points }: { points: PayrollPeriodPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Belum ada run payroll yang selesai untuk ditampilkan.
      </p>
    );
  }
  const max = Math.max(...points.map((p) => p.gross), 1);

  return (
    <div className="flex h-48 items-end gap-2">
      {points.map((p) => (
        <div key={p.periodLabel} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-brand transition-all hover:bg-brand-dark"
            style={{ height: `${Math.max(Math.round((p.gross / max) * 100), 2)}%` }}
            title={`${p.periodLabel}: ${formatRupiah(p.gross)} bruto`}
          />
          <span className="w-full truncate text-center text-[10px] leading-tight text-muted">
            {p.periodLabel}
          </span>
        </div>
      ))}
    </div>
  );
}
