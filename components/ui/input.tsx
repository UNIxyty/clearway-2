import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-cw-text placeholder:text-cw-text-muted selection:bg-cw-primary selection:text-cw-text-on-primary border-cw-border-control h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-cw-focus focus-visible:ring-cw-focus/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-cw-danger/20 aria-invalid:border-cw-danger",
        className
      )}
      {...props}
    />
  );
}

export { Input };
