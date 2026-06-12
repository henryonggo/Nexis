const MONTH_NAMES_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** Format an ISO `YYYY-MM-DD` date the Indonesian short way (e.g. "3 Jun 2026"). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTH_NAMES_ID[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** A compact inclusive date range, collapsing a single-day request. */
export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}
