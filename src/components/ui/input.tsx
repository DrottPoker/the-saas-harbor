import * as React from "react";
import { cn } from "@/lib/utils";

// 16px text on small screens prevents iOS zoom on focus.
export const fieldClasses =
  "w-full min-w-0 rounded-md border border-border-strong bg-background px-3 text-base text-foreground transition-[border-color,box-shadow] placeholder:text-faint-foreground focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:text-sm";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClasses,
        "h-10 file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        type === "file" && "h-auto py-2",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
