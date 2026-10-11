"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

// The portal kit's button look (components/kit, portal redesign §2.1) for the pages still on this component:
// 36 / 30 / 44 high, radius 10 (8 small), the design's focus ring and disabled state.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-sans text-[14px] font-semibold transition-colors duration-[120ms] outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-focus)] disabled:cursor-not-allowed disabled:border-cw-disabled-border disabled:bg-cw-disabled-bg disabled:text-cw-text-disabled [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:border-cw-danger",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-cw-primary text-cw-text-on-primary hover:bg-cw-primary-hover active:bg-cw-primary-active",
        destructive: "border border-transparent bg-cw-danger-solid text-cw-text-on-primary hover:bg-cw-danger-solid-hover focus-visible:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-danger)]",
        outline: "border border-cw-border-control bg-cw-bg-surface text-cw-text hover:border-cw-border-strong hover:bg-cw-bg-hover active:bg-cw-bg-active",
        secondary: "border border-cw-border-control bg-cw-bg-surface text-cw-text hover:border-cw-border-strong hover:bg-cw-bg-hover active:bg-cw-bg-active",
        ghost: "border border-transparent bg-transparent text-cw-text-body hover:bg-cw-bg-hover hover:text-cw-text disabled:bg-transparent",
        link: "border-none bg-transparent text-cw-text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-[30px] gap-1.5 rounded-[8px] px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-[30px] gap-1.5 rounded-[8px] px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-[18px] text-[15px]",
        icon: "size-9",
        "icon-xs": "size-[30px] rounded-[8px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-[30px] rounded-[8px]",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
