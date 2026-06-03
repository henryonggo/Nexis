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
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
