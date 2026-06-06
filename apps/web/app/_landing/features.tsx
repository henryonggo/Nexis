"use client";

import { motion } from "framer-motion";
import { Reveal, RevealGroup, RevealItem } from "./reveal";

const FEATURES = [
  {
    icon: "🏢",
    title: "Multi-perusahaan",
    body: "Satu akun, banyak perusahaan, peran berbeda di tiap perusahaan. Berpindah dalam sekali klik.",
  },
  {
    icon: "💸",
    title: "Penggajian otomatis",
    body: "Hitung gaji, tunjangan, dan potongan dalam rupiah penuh — tanpa rumus manual di spreadsheet.",
  },
  {
    icon: "⏱️",
    title: "Absensi & jadwal",
    body: "Clock-in dengan geofence dan selfie dari aplikasi karyawan. Pantau kehadiran secara real-time.",
  },
  {
    icon: "🌴",
    title: "Cuti & klaim",
    body: "Pengajuan cuti dan reimbursement dengan alur persetujuan dan saldo otomatis.",
  },
  {
    icon: "📊",
    title: "Laporan pajak",
    body: "Ekspor PPh 21, bukti potong, dan laporan BPJS siap lapor. CSV & PDF dalam sekali klik.",
  },
  {
    icon: "🔒",
    title: "Aman per perusahaan",
    body: "Data tiap perusahaan terisolasi di tingkat basis data (RLS). Akses sesuai peran, selalu.",
  },
];

export function Features() {
  return (
    <section id="fitur" className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Fitur</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Semua kebutuhan HR &amp; payroll, dalam satu tempat
        </h2>
        <p className="mt-4 text-lg text-muted">
          Dirancang untuk tim Indonesia — dari startup 3 orang sampai perusahaan ratusan karyawan.
        </p>
      </Reveal>

      <RevealGroup className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <RevealItem key={f.title}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="group h-full rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-sm transition-shadow hover:shadow-xl hover:shadow-ink/5"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-light text-2xl transition-transform group-hover:scale-110">
                {f.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </motion.div>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}
