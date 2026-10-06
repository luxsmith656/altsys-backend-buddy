import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, onKeyDown, min, step, ...props }, ref) => {
    return (
      <input
        type={type}
        min={min}
        step={step}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || type !== 'number') return;
          if (['e', 'E', '+'].includes(event.key) || (event.key === '-' && min !== undefined && Number(min) >= 0)) event.preventDefault();
        }}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (type === 'number' && value !== '') {
            const number = event.currentTarget.valueAsNumber;
            if (!Number.isFinite(number) || (min !== undefined && number < Number(min)) || (step !== undefined && Number(step) === 1 && !Number.isInteger(number))) return;
          }
          onChange?.(event);
        }}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
