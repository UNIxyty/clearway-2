import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        not_departed: "border-slate-500 bg-slate-600/50 text-slate-100",
        airborne: "border-blue-500/70 bg-blue-500/30 text-blue-100",
        delayed: "border-yellow-400/70 bg-yellow-400/25 text-yellow-100",
        ctot: "border-violet-500/70 bg-violet-500/25 text-violet-100",
        arrived: "border-pink-500/70 bg-pink-500/30 text-pink-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
