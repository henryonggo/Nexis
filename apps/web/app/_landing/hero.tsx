"use client";

import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import type { MouseEvent } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero({ isAuthed }: { isAuthed: boolean }) {
  const reduce = useReducedMotion();

  // Pointer parallax for the floating card.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), { stiffness: 120, damping: 18 });

  function onMove(e: MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <section className="relative overflow-hidden pb-24 pt-32 sm:pt-40">
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 lp-grid" />
        <div className="lp-blob absolute -left-20 top-0 h-[34rem] w-[34rem] animate-aurora-slow rounded-full bg-brand/30" />
        <div className="lp-blob absolute -right-24 top-24 h-[30rem] w-[30rem] animate-aurora-slower rounded-full bg-accent/25" />
        <div className="lp-blob absolute left-1/3 top-40 h-[26rem] w-[26rem] animate-aurora-slow rounded-full bg-brand/15" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        {/* Copy */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Gratis untuk 5 karyawan pertama
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
            className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl"
          >
            HR &amp; Payroll Indonesia,{" "}
            <span className="lp-gradient-text">tanpa ribet.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.12 }}
            className="mt-5 max-w-xl text-lg text-muted"
          >
            Kelola banyak perusahaan dalam satu akun. Hitung gaji, PPh 21, BPJS, THR,
            dan lembur secara otomatis dan sesuai aturan — tanpa NPWP untuk memulai.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href={isAuthed ? "/dashboard" : "/sign-up"}
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark"
            >
              {isAuthed ? "Buka Dashboard" : "Mulai gratis"}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <a
              href="#fitur"
              className="inline-flex items-center justify-center rounded-md border border-border bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:border-brand/40 hover:text-brand"
            >
              Lihat fitur
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-4 text-xs text-muted"
          >
            Tanpa kartu kredit · Sesuai PMK 168/2023 (TER) · Bahasa Indonesia
          </motion.p>
        </div>

        {/* Floating mock payslip */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="relative mx-auto w-full max-w-md [perspective:1200px]"
        >
          <motion.div
            style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
            className="rounded-2xl border border-border bg-white/90 p-6 shadow-2xl shadow-ink/10 lp-glass"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted">Slip gaji · Mei 2026</p>
                <p className="text-lg font-bold text-ink">Sari Wijaya</p>
              </div>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                Dibayar
              </span>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <Row label="Gaji pokok" value="Rp 8.500.000" />
              <Row label="Tunjangan" value="Rp 1.250.000" />
              <Row label="Lembur (1/173)" value="Rp 420.000" accent />
              <div className="my-2 border-t border-dashed border-border" />
              <Row label="PPh 21 (TER)" value="− Rp 312.000" muted />
              <Row label="BPJS Kesehatan" value="− Rp 85.000" muted />
              <Row label="BPJS TK" value="− Rp 170.000" muted />
            </div>

            <div className="mt-5 flex items-end justify-between rounded-xl bg-brand p-4 text-white">
              <span className="text-sm font-medium opacity-90">Gaji bersih</span>
              <span className="text-2xl font-extrabold tabular-nums">Rp 9.413.000</span>
            </div>
          </motion.div>

          {/* Floating chips */}
          {!reduce && (
            <>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-6 top-10 hidden rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-ink shadow-lg sm:block"
              >
                ✅ BPJS otomatis
              </motion.div>
              <motion.div
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-4 bottom-12 hidden rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-ink shadow-lg sm:block"
              >
                📄 Slip PDF instan
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span
        className={`tabular-nums font-semibold ${
          accent ? "text-accent" : muted ? "text-muted" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
