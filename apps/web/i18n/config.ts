/** Client-safe locale config (no server-only imports). */

/** App locales. id-ID is the default; en is secondary (AGENTS.md rule 7). */
export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "NEXIS_LOCALE";

export const LOCALE_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

export function isLocale(value: string | undefined): value is Locale {
  return value === "id" || value === "en";
}
