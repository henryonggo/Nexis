"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PLANS, formatRupiah } from "@/lib/billing-plans";
import { Reveal, RevealGroup, RevealItem } from "./reveal";

function priceLabel(pricePerSeat: number | null): { main: string; sub: string } {
  if (pricePerSeat === null) return { main: "Hubungi kami", sub: "harga khusus" };
  if (pricePerSeat === 0) return { main: "Gratis", sub: "selamanya" };
  return { main: formatRupiah(pricePerSeat), sub: "/ karyawan / bulan" };
}

export function Pricing({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section id="harga" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Harga</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Mulai gratis, bayar saat tumbuh
        </h2>
        <p className="mt-4 text-lg text-muted">
          5 karyawan pertama selalu gratis. Tanpa biaya tersembunyi, tanpa kartu kredit.
        </p>
      </Reveal>

      <RevealGroup className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const { main, sub } = priceLabel(plan.pricePerSeat);
          const featured = plan.id === "starter";
          return (
            <RevealItem key={plan.id} className="h-full">
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`flex h-full flex-col rounded-2xl border p-6 ${
                  featured
                    ? "border-brand bg-white shadow-xl shadow-brand/10 ring-1 ring-brand"
                    : "border-[color:var(--border)] bg-white shadow-sm"
                }`}
              >
                {featured && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
                    Paling populer
                  </span>
                )}
                <h3 className="text-lg font-bold text-ink">{plan.label}</h3>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="whitespace-nowrap text-3xl font-extrabold tracking-tight text-ink">
                    {main}
                  </span>
                  <span className="text-sm text-muted">{sub}</span>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{plan.description}</p>
                <Link
                  href={
                    plan.id === "enterprise"
                      ? "mailto:halo@nexis.id"
                      : isAuthed
                        ? "/billing"
                        : "/sign-up"
                  }
                  className={`mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                    featured
                      ? "bg-brand text-white hover:bg-brand-dark"
                      : "border border-[color:var(--border)] text-ink hover:border-brand/40 hover:text-brand"
                  }`}
                >
                  {plan.id === "enterprise"
                    ? "Hubungi kami"
                    : plan.id === "free"
                      ? "Mulai gratis"
                      : "Pilih paket"}
                </Link>
              </motion.div>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </section>
  );
}
