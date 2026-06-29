import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-card bg-brand-050 shrink-0">
              <Icon className="h-6 w-6 text-brand" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            {description && (
              typeof description === "string" ? (
                <p className="mt-1 text-sm text-muted">{description}</p>
              ) : (
                <div className="mt-1 text-sm text-muted">{description}</div>
              )
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
