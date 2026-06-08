"use client";

import { useEffect } from "react";

/**
 * Root-level safety net for errors thrown outside the (app) segment (e.g. the
 * root layout itself). Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            fontFamily: "Inter, Arial, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>
            Terjadi kesalahan
          </h1>
          <p style={{ fontSize: 14, color: "#64748B" }}>
            Aplikasi gagal dimuat. Silakan coba lagi.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#1F6FEB",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
