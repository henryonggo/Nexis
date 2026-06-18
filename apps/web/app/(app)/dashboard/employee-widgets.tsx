import Link from "next/link";
import type { ReactNode } from "react";
import { formatRupiah } from "@nexis/money";
import { Card } from "@/components/ui/card";

/** Compact stat tile: icon, label, big value, hint — links to the detail surface. */
export function StatCard({
  href,
  icon,
  label,
  value,
  hint,
  tone = "brand",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "brand" | "success" | "warning";
}) {
  const toneRing = {
    brand: "bg-brand-light text-brand",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  }[tone];
  return (
    <Card asChild className="group p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-elev-2">
      <Link href={href}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-muted">{label}</div>
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${toneRing}`}>{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
        <div className="mt-1 text-xs text-muted group-hover:text-brand">{hint}</div>
      </Link>
    </Card>
  );
}

/** A point on the net-pay trend, oldest → newest. */
export type PayPoint = { label: string; net: number };

/** Inline SVG bar chart of net pay over the last few months. No chart lib. */
export function PayTrendChart({
  points,
  title,
  averageLabel,
  emptyLabel,
}: {
  points: PayPoint[];
  title: string;
  averageLabel: string;
  emptyLabel: string;
}) {
  const avg = points.length
    ? Math.round(points.reduce((s, p) => s + p.net, 0) / points.length)
    : 0;

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {points.length > 0 && (
          <span className="text-xs text-muted">{averageLabel.replace("{amount}", formatRupiah(avg))}</span>
        )}
      </div>

      {points.length === 0 ? (
        <div className="mt-6 grid h-32 place-items-center text-sm text-muted">{emptyLabel}</div>
      ) : (
        <PayBars points={points} />
      )}
    </Card>
  );
}

function PayBars({ points }: { points: PayPoint[] }) {
  const W = 480;
  const H = 150;
  const pad = { top: 14, bottom: 22 };
  const max = Math.max(...points.map((p) => p.net), 1);
  const n = points.length;
  const slot = W / n;
  const barW = Math.min(46, slot * 0.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-36 w-full" role="img">
      {points.map((p, i) => {
        const h = ((H - pad.top - pad.bottom) * p.net) / max;
        const x = i * slot + (slot - barW) / 2;
        const y = H - pad.bottom - h;
        const isLast = i === n - 1;
        return (
          <g key={i}>
            <title>{`${p.label}: ${formatRupiah(p.net)}`}</title>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={5}
              className={isLast ? "fill-brand" : "fill-brand/30"}
            />
            <text
              x={x + barW / 2}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted text-[11px]"
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Latest payslip: take-home donut + earnings/deduction legend. */
export function PayBreakdownCard({
  gross,
  net,
  parts,
  title,
  takeHomeLabel,
}: {
  gross: number;
  net: number;
  parts: { label: string; value: number; color: string }[];
  title: string;
  takeHomeLabel: string;
}) {
  const pct = gross > 0 ? Math.round((net / gross) * 100) : 0;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4 flex items-center gap-4">
        <Donut percent={pct} centerTop={`${pct}%`} centerBottom={takeHomeLabel} color="#2452E6" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-lg font-bold text-ink">{formatRupiah(net)}</div>
          {parts.map((p) => (
            <div key={p.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.label}
              </span>
              <span className="font-medium text-ink">{formatRupiah(p.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Leave-by-status donut for the year, with days taken + next upcoming. */
export function LeaveCard({
  approved,
  pending,
  rejected,
  daysUsed,
  daysWord,
  title,
  upcomingLabel,
  legend,
}: {
  approved: number;
  pending: number;
  rejected: number;
  daysUsed: number;
  daysWord: string;
  title: string;
  upcomingLabel: string;
  legend: { approved: string; pending: string; rejected: string };
}) {
  const segments = [
    { value: approved, color: "#16A34A", label: legend.approved },
    { value: pending, color: "#F59E0B", label: legend.pending },
    { value: rejected, color: "#DC2626", label: legend.rejected },
  ];

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4 flex items-center gap-4">
        <SegmentDonut segments={segments} centerTop={String(daysUsed)} centerBottom={daysWord} />
        <div className="min-w-0 flex-1 space-y-1.5">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="font-medium text-ink">{s.value}</span>
            </div>
          ))}
          <div className="pt-1 text-xs text-muted">{upcomingLabel}</div>
        </div>
      </div>
    </Card>
  );
}

/** Last 14 days of attendance as a colored strip. */
export function AttendanceStrip({
  days,
  title,
  presentLabel,
}: {
  days: { key: string; present: boolean; weekend: boolean }[];
  title: string;
  presentLabel: string;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4 flex items-end gap-1.5">
        {days.map((d) => (
          <div
            key={d.key}
            title={d.key}
            className={`h-12 flex-1 rounded-md transition-colors ${
              d.present ? "bg-success" : d.weekend ? "bg-surface-2" : "bg-danger/15"
            }`}
          />
        ))}
      </div>
      <div className="mt-3 text-xs text-muted">{presentLabel}</div>
    </Card>
  );
}

/** Single-value progress donut (circumference-100 trick). */
function Donut({
  percent,
  centerTop,
  centerBottom,
  color,
}: {
  percent: number;
  centerTop: string;
  centerBottom: string;
  color: string;
}) {
  const r = 15.915;
  return (
    <svg viewBox="0 0 42 42" className="h-24 w-24 shrink-0">
      <g transform="rotate(-90 21 21)">
        <circle cx="21" cy="21" r={r} fill="none" stroke="#F1F4F9" strokeWidth="5" />
        <circle
          cx="21"
          cy="21"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${percent} ${100 - percent}`}
        />
      </g>
      <text x="21" y="20" textAnchor="middle" className="fill-ink text-[8px] font-bold">
        {centerTop}
      </text>
      <text x="21" y="27" textAnchor="middle" className="fill-muted text-[4px]">
        {centerBottom}
      </text>
    </svg>
  );
}

/** Multi-segment donut for status breakdowns. */
function SegmentDonut({
  segments,
  centerTop,
  centerBottom,
}: {
  segments: { value: number; color: string }[];
  centerTop: string;
  centerBottom: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const r = 15.915;
  let offset = 0;

  return (
    <svg viewBox="0 0 42 42" className="h-24 w-24 shrink-0">
      <g transform="rotate(-90 21 21)">
        <circle cx="21" cy="21" r={r} fill="none" stroke="#F1F4F9" strokeWidth="5" />
        {total > 0 &&
          segments.map((seg, i) => {
            const len = (seg.value / total) * 100;
            const el = (
              <circle
                key={i}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="5"
                strokeDasharray={`${len} ${100 - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </g>
      <text x="21" y="20" textAnchor="middle" className="fill-ink text-[8px] font-bold">
        {centerTop}
      </text>
      <text x="21" y="27" textAnchor="middle" className="fill-muted text-[4px]">
        {centerBottom}
      </text>
    </svg>
  );
}
