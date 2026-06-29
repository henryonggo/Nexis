import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared field styling — reuse on native <select>/<textarea> so they match <Input>. */
export const fieldClasses =
  "flex h-9 w-full rounded-control border border-hairline bg-surface px-3 py-1 text-sm text-ink shadow-sm transition-colors duration-base placeholder:text-faint focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/45 disabled:cursor-not-allowed disabled:opacity-60";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(fieldClasses, "file:border-0 file:bg-transparent file:text-sm file:font-medium", className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
