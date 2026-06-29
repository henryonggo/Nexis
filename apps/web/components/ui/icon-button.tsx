"use client";

import * as React from "react";
import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  icon: LucideIcon;
  label: string;
  href?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, label, href, tooltipSide = "right", variant = "ghost", size = "icon", ...props }, ref) => {
    const content = (
      <Button ref={ref} variant={variant} size={size} aria-label={label} asChild={!!href} {...props}>
        {href ? (
          <Link href={href}>
            <Icon className="h-[18px] w-[18px]" />
          </Link>
        ) : (
          <Icon className="h-[18px] w-[18px]" />
        )}
      </Button>
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{label}</TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton };
