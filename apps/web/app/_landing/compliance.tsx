"use client";

import { Reveal, RevealGroup, RevealItem } from "./reveal";

const ITEMS = [
  { code: "PPh 21", desc: "Metode TER sesuai PMK 168/2023" },
  { code: "BPJS Kesehatan", desc: "Iuran otomatis sesuai upah" },
  { code: "BPJS Ketenagakerjaan", desc: "JHT, JP, JKK, JKM lengkap" },
  { code: "THR", desc: "Perhitungan proporsional masa kerja" },
  { code: "Lembur 1/173", desc: "Sesuai aturan ketenagakerjaan" },
  { code: "Bukti potong", desc: "Siap lapor ke DJP" },
];

export function Compliance() {
  return (
    <section id="kepatuhan" className="relative overflow-hidden bg-ink py-24 text-white">
      <div className="pointer-events-none absolute inset-0 -z-0 opacity-30">
        <div className="lp-blob absolute -left-20 top-10 h-80 w-80 rounded-full bg-brand/40" />
        <div className="lp-blob absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-accent/30" />
      </div>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Kepatuhan</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Aturan pajak &amp; ketenagakerjaan Indonesia, sudah dihitung untuk Anda
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Tarif pajak dan BPJS tersimpan sebagai data berversi — saat aturan berubah,
            perhitungan ikut menyesuaikan tanpa perlu update aplikasi.
          </p>
          <p className="mt-3 text-sm text-white/50">
            Semua nominal dalam rupiah penuh, tanpa pembulatan desimal yang keliru.
          </p>
        </Reveal>

        <RevealGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <RevealItem key={it.code}>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:border-accent/40 hover:bg-white/10">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-ink">
                  ✓
                </span>
                <div>
                  <p className="font-semibold">{it.code}</p>
                  <p className="text-sm text-white/60">{it.desc}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
