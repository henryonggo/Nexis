"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-ink group-[.toaster]:border-border group-[.toaster]:shadow-elev-3 group-[.toaster]:rounded-md",
          description: "group-[.toast]:text-muted",
          actionButton: "group-[.toast]:bg-brand group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-surface-2 group-[.toast]:text-muted",
          error: "group-[.toaster]:border-danger/40",
          success: "group-[.toaster]:border-success/40",
        },
      }}
      {...props}
    />
  );
}
