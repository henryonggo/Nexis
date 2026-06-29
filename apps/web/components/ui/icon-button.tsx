"use client";

import * as React from "react";
import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  // Accept a Lucide component (client callers) OR a pre-rendered element (Server
  // Component callers). Passing a component across the RSC boundary throws
  // "Functions cannot be passed directly to Client Components"; passing an
  // element lets React server-render it to SVG before serializing.
  icon: LucideIcon | React.ReactElement;
  label: string;
  href?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, href, tooltipSide = "right", variant = "ghost", size = "icon", ...props }, ref) => {
    const iconNode = React.isValidElement(icon)
      ? icon
      : React.createElement(icon as React.ComponentType<{ className?: string }>, {
          className: "h-[18px] w-[18px]",
        });
    const content = (
      <Button ref={ref} variant={variant} size={size} aria-label={label} asChild={!!href} {...props}>
        {href ? <Link href={href}>{iconNode}</Link> : iconNode}
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
