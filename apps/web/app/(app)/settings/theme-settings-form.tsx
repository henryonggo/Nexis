"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ThemeSettingsForm() {
  const t = useTranslations("settings.appearance");
  
  const [theme, setTheme] = useState<"soft-ui" | "mono">("soft-ui");
  const [density, setDensity] = useState<"standard" | "compact">("standard");
  const [mounted, setMounted] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("nexis-theme") as "soft-ui" | "mono" | null;
    const savedDensity = localStorage.getItem("nexis-density") as "standard" | "compact" | null;
    
    if (savedTheme) setTheme(savedTheme);
    if (savedDensity) setDensity(savedDensity);
    
    setMounted(true);
  }, []);

  // Handle setting updates
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      localStorage.setItem("nexis-theme", theme);
      localStorage.setItem("nexis-density", density);
      
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
          : "border-white/20 bg-white/10 hover:bg-white/20 hover:border-white/30"
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
          : "border-white/20 bg-white/10 hover:bg-white/20 hover:border-white/30"
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

        <Button type="submit" className="w-full">
          {t("save")}
        </Button>
      </form>
    </Card>
  );
}
