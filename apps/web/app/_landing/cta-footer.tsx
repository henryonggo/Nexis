"use client";

import Link from "next/link";
import { Reveal } from "./reveal";

export function CtaFooter({ isAuthed }: { isAuthed: boolean }) {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-16 text-center text-white sm:px-12">
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <div className="lp-blob absolute -left-10 -top-10 h-72 w-72 animate-aurora-slow rounded-full bg-white/20" />
              <div className="lp-blob absolute -bottom-16 right-0 h-72 w-72 animate-aurora-slower rounded-full bg-accent/40" />
            </div>
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                Siap menggaji tim Anda tanpa pusing?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Buat perusahaan pertama Anda dalam hitungan menit. Gratis untuk 5 karyawan pertama.
              </p>
              <Link
                href={isAuthed ? "/dashboard" : "/sign-up"}
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-bold text-brand shadow-lg transition hover:bg-white/90"
              >
                {isAuthed ? "Buka Dashboard" : "Mulai gratis sekarang"}
                <span>→</span>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-[color:var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-black text-white">
              N
            </span>
            Nexis
          </div>
          <p className="text-sm text-muted">
            HR &amp; Payroll untuk Indonesia · © {new Date().getFullYear()} Nexis
          </p>
          <div className="flex items-center gap-5 text-sm font-medium text-muted">
            <a href="#fitur" className="transition-colors hover:text-ink">Fitur</a>
            <a href="#harga" className="transition-colors hover:text-ink">Harga</a>
            <Link href="/sign-in" className="transition-colors hover:text-ink">Masuk</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
