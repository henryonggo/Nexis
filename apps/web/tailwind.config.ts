import type { Config } from "tailwindcss";

// Design tokens from docs/06-design-system.md
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#1F6FEB", dark: "#1551B5", light: "#EAF1FE" },
        accent: "#14B8A6",
        success: "#16A34A",
        danger: "#DC2626",
        warning: "#F59E0B",
        ink: "#0F172A",
        muted: "#64748B",
      },
      borderRadius: { lg: "12px", md: "8px" },
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
  plugins: [],
};

export default config;
