"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { setDarkMode } from "@/app/actions/set-dark-mode";

export function ThemeSettingsForm() {
  const t = useTranslations("settings.appearance");

  const [theme, setTheme] = useState<"soft-ui" | "mono">("soft-ui");
  const [density, setDensity] = useState<"standard" | "compact">("standard");
  const [mode, setMode] = useState<"light" | "dark" | "system">("system");
  const [mounted, setMounted] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("nexis-theme") as "soft-ui" | "mono" | null;
    const savedDensity = localStorage.getItem("nexis-density") as "standard" | "compact" | null;
    const savedMode = localStorage.getItem("nexis-mode") as "light" | "dark" | "system" | null;

    if (savedTheme) setTheme(savedTheme);
    if (savedDensity) setDensity(savedDensity);
    if (savedMode) setMode(savedMode);

    setMounted(true);
  }, []);

  // Handle setting updates
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      localStorage.setItem("nexis-theme", theme);
      localStorage.setItem("nexis-density", density);
      localStorage.setItem("nexis-mode", mode);

      const doc = document.documentElement;

      // Update theme class
      if (theme === "mono") {
        doc.classList.add("theme-mono");
      } else {
        doc.classList.remove("theme-mono");
      }

      // Update density class
      if (density === "compact") {
        doc.classList.add("density-compact");
      } else {
        doc.classList.remove("density-compact");
      }

      // Update dark mode class
      if (mode === "dark") {
        doc.classList.add("dark");
      } else if (mode === "light") {
        doc.classList.remove("dark");
      } else {
        // system mode: check prefers-color-scheme
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          doc.classList.add("dark");
        } else {
          doc.classList.remove("dark");
        }
      }

      // Persist dark mode choice to cookie via server action
      await setDarkMode(mode);

      toast.success(t("saved"));
    } catch (error) {
      toast.error("Failed to save appearance settings");
    }
  };

  const getThemeButtonClass = (option: "soft-ui" | "mono") => {
    const isSelected = theme === option;
    if (theme === "mono") {
      return `flex flex-col items-start text-left p-3 transition-all cursor-pointer rounded-none border-2 ${
        isSelected
          ? "border-ink bg-ink/5"
          : "border-border bg-surface hover:border-ink/50"
      }`;
    } else {
      return `flex flex-col items-start text-left p-3 transition-all cursor-pointer rounded-lg border-[1.5px] ${
        isSelected
          ? "border-brand/40 bg-brand/5 shadow-elev-1"
          : "border-hairline bg-surface-2 hover:bg-surface hover:border-hairline"
      }`;
    }
  };

  const getDensityButtonClass = (option: "standard" | "compact") => {
    const isSelected = density === option;
    if (theme === "mono") {
      return `flex flex-col items-start text-left p-3 transition-all cursor-pointer rounded-none border-2 ${
        isSelected
          ? "border-ink bg-ink/5"
          : "border-border bg-surface hover:border-ink/50"
      }`;
    } else {
      return `flex flex-col items-start text-left p-3 transition-all cursor-pointer rounded-lg border-[1.5px] ${
        isSelected
          ? "border-brand/40 bg-brand/5 shadow-elev-1"
          : "border-hairline bg-surface-2 hover:bg-surface hover:border-hairline"
      }`;
    }
  };

  const getModeButtonClass = (option: "light" | "dark" | "system") => {
    const isSelected = mode === option;
    if (theme === "mono") {
      return `flex flex-col items-start text-left p-3 transition-all cursor-pointer rounded-none border-2 ${
        isSelected
          ? "border-ink bg-ink/5"
          : "border-border bg-surface hover:border-ink/50"
      }`;
    } else {
      return `flex flex-col items-start text-left p-3 transition-all cursor-pointer rounded-lg border-[1.5px] ${
        isSelected
          ? "border-brand/40 bg-brand/5 shadow-elev-1"
          : "border-hairline bg-surface-2 hover:bg-surface hover:border-hairline"
      }`;
    }
  };

  // Prevent hydration mismatch by returning empty space or skeleton until mounted
  if (!mounted) {
    return (
      <Card className="p-4 space-y-4 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-1/3"></div>
        <div className="h-8 bg-surface-2 rounded"></div>
        <div className="h-8 bg-surface-2 rounded"></div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="mb-4 text-sm text-muted">{t("description")}</p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Theme Section */}
        <div className="space-y-2.5">
          <Label className="text-sm font-semibold text-ink">{t("theme")}</Label>
          <div className="grid grid-cols-2 gap-3">
            {/* Soft-UI Option */}
            <button
              type="button"
              onClick={() => setTheme("soft-ui")}
              className={getThemeButtonClass("soft-ui")}
            >
              <span className="font-semibold text-sm text-ink">{t("themeSoftUi")}</span>
              <span className="text-xs text-muted mt-1">
                Warm colors, royal indigo, soft rounded corners and cards
              </span>
            </button>

            {/* Swiss Mono Option */}
            <button
              type="button"
              onClick={() => setTheme("mono")}
              className={getThemeButtonClass("mono")}
            >
              <span className="font-semibold text-sm text-ink">{t("themeMono")}</span>
              <span className="text-xs text-muted mt-1">
                Monochrome, high contrast, sharp square edges, zero shadows
              </span>
            </button>
          </div>
        </div>

        {/* Density Section */}
        <div className="space-y-2.5">
          <Label className="text-sm font-semibold text-ink">{t("density")}</Label>
          <div className="grid grid-cols-2 gap-3">
            {/* Standard Density */}
            <button
              type="button"
              onClick={() => setDensity("standard")}
              className={getDensityButtonClass("standard")}
            >
              <span className="font-semibold text-sm text-ink">{t("densityStandard")}</span>
              <span className="text-xs text-muted mt-1">
                Standard padding, margins, and layout spacing
              </span>
            </button>

            {/* Compact Density */}
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={getDensityButtonClass("compact")}
            >
              <span className="font-semibold text-sm text-ink">{t("densityCompact")}</span>
              <span className="text-xs text-muted mt-1">
                Compact cells, smaller headers, optimized for data density
              </span>
            </button>
          </div>
        </div>

        {/* Dark Mode Section */}
        <div className="space-y-2.5">
          <Label className="text-sm font-semibold text-ink">{t("mode")}</Label>
          <div className="grid grid-cols-3 gap-3">
            {/* Light Mode */}
            <button
              type="button"
              onClick={() => setMode("light")}
              className={getModeButtonClass("light")}
            >
              <span className="font-semibold text-sm text-ink">{t("modeLight")}</span>
              <span className="text-xs text-muted mt-1">Light theme</span>
            </button>

            {/* Dark Mode */}
            <button
              type="button"
              onClick={() => setMode("dark")}
              className={getModeButtonClass("dark")}
            >
              <span className="font-semibold text-sm text-ink">{t("modeDark")}</span>
              <span className="text-xs text-muted mt-1">Dark theme</span>
            </button>

            {/* System Mode */}
            <button
              type="button"
              onClick={() => setMode("system")}
              className={getModeButtonClass("system")}
            >
              <span className="font-semibold text-sm text-ink">{t("modeSystem")}</span>
              <span className="text-xs text-muted mt-1">Follow OS setting</span>
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full">
          {t("save")}
        </Button>
      </form>
    </Card>
  );
}
