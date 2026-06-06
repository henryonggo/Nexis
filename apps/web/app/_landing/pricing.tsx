"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Reveal } from "./reveal";

const INCLUDED = [
  "Semua fitur HR & payroll",
  "Multi-perusahaan dalam satu akun",
  "PPh 21, BPJS, THR & lembur otomatis",
  "Tanpa biaya setup, tanpa kartu kredit",
];

export function Pricing({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section id="harga" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Harga</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Mulai gratis, bayar saat tumbuh
        </h2>
        <p className="mt-4 text-lg text-muted">
          5 karyawan pertama selalu gratis. Setelah itu cukup Rp 20.000 per karyawan per bulan —
          tanpa biaya tersembunyi.
        </p>
      </Reveal>

      <Reveal className="mx-auto mt-14 max-w-lg" delay={0.05}>
        <motion.div
          whileHover={{ y: -6 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="overflow-hidden rounded-2xl border border-brand bg-white shadow-xl shadow-brand/10 ring-1 ring-brand"
        >
          {/* Free tier */}
          <div className="border-b border-[color:var(--border)] p-8 text-center">
            <span className="inline-flex rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark">
              5 karyawan pertama
            </span>
            <p className="mt-4 text-5xl font-extrabold tracking-tight text-ink">Gratis</p>
            <p className="mt-1 text-sm text-muted">selamanya, tanpa batas waktu</p>
          </div>

          {/* Paid tier */}
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-muted">Karyawan ke-6 dan seterusnya</p>
            <div className="mt-2 flex items-baseline justify-center gap-1.5">
              <span className="text-4xl font-extrabold tracking-tight text-ink">Rp 20.000</span>
              <span className="text-sm text-muted">/ karyawan / bulan</span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Contoh: 10 karyawan = Rp 100.000 / bulan (5 gratis + 5 × Rp 20.000)
            </p>

            <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-50 text-xs font-black text-accent">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href={isAuthed ? "/billing" : "/sign-up"}
              className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              {isAuthed ? "Buka tagihan" : "Mulai gratis"}
            </Link>
          </div>
        </motion.div>
      </Reveal>
    </section>
  );
}
