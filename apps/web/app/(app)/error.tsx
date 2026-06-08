"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Segment error boundary for every authenticated page. A thrown server-component
 * error (e.g. a failed Supabase query) renders here with a working retry instead
 * of a dead segment, so the browser back button still restores the prior page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the console for debugging; server logs capture the rest.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div>
        <h1 className="text-xl font-bold text-ink">Terjadi kesalahan</h1>
        <p className="mt-1 text-sm text-muted">
          Halaman ini gagal dimuat. Coba lagi atau kembali ke dashboard.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Coba lagi
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light"
        >
          Kembali ke dashboard
        </Link>
      </div>
    </div>
  );
}
