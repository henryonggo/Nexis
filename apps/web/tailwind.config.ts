import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Design tokens from docs/06-design-system.md — Nexis v2 refresh:
// docs/handoff/ui-refresh-phase1.md. Colors mirror the CSS vars in app/globals.css.
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#2452E6", dark: "#1A3FC0", light: "#EAF0FF" },
        accent: "#0EA5A4",
        success: "#16A34A",
        danger: "#DC2626",
        warning: "#F59E0B",
        info: "#0EA5E9",
        ink: "#0B1220",
        muted: "#5B6675",
        surface: { DEFAULT: "#FFFFFF", 2: "#F1F4F9" },

        // shadcn/ui semantic tokens (HSL vars from globals.css).
        // Note: legacy flat `accent`/`muted` kept above; our primitives use
        // brand-light/surface-2 in place of shadcn's clashing accent/muted.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "elev-1": "var(--elev-1)",
        "elev-2": "var(--elev-2)",
        "elev-3": "var(--elev-3)",
        "elev-4": "var(--elev-4)",
      },
      fontFamily: { sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"] },
      keyframes: {
        aurora: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(3%, -4%) scale(1.08)" },
          "66%": { transform: "translate(-3%, 3%) scale(0.96)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "aurora-slow": "aurora 18s ease-in-out infinite",
        "aurora-slower": "aurora 26s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
