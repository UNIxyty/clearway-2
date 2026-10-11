import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // The portal kit's text field (portal redesign §2.2): 36 high, radius 8, focus ring + halo.
        "file:text-cw-text placeholder:text-cw-text-placeholder selection:bg-cw-primary selection:text-cw-text-on-primary border-cw-border-control h-9 w-full min-w-0 rounded-[8px] border bg-cw-bg-surface px-3 py-1 font-sans text-[14px] text-cw-text transition-[border-color,box-shadow] duration-[120ms] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:border-cw-disabled-border disabled:bg-cw-disabled-bg disabled:text-cw-text-disabled",
        "focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]",
        "aria-invalid:border-cw-danger",
        className
      )}
      {...props}
    />
  );
}

export { Input };
