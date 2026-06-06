"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const LINKS = [
  { href: "#fitur", label: "Fitur" },
  { href: "#kepatuhan", label: "Kepatuhan" },
  { href: "#harga", label: "Harga" },
];

export function LandingNav({ isAuthed }: { isAuthed: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "lp-glass border-b border-[color:var(--border)] shadow-sm" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-sm font-black text-white">
            N
          </span>
          Nexis
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isAuthed ? (
            <Link
              href="/dashboard"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Buka Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden rounded-md px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/5 sm:inline-flex"
              >
                Masuk
              </Link>
              <Link
                href="/sign-up"
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Coba Gratis
              </Link>
            </>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
