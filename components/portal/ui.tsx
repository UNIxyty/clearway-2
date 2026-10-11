"use client";

// Portal primitives, kept for the pages that use them; the button and the empty state are drawn by the portal kit
// (components/kit, portal redesign stage 2). Pure presentation: no data logic here.

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/kit";

export function PCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1",
        className
      )}
      {...rest}
    />
  );
}

export function PSectionTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "text-[11px] font-bold uppercase tracking-[0.12em] text-cw-text-muted",
        className
      )}
      {...rest}
    />
  );
}

type PButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger-quiet" | "stop";
  size?: "md" | "sm";
};

/** The portal kit's button (components/kit, portal redesign §2.1) with this file's props. "stop" is the kit's
 *  secondary shape in the orange family (stopping a running search, confirming a revoke). */
export function PButton({ variant = "secondary", size = "md", className, ...rest }: PButtonProps) {
  if (variant === "stop") {
    return <Button variant="secondary" size={size} className={clsx("!border-cw-orange-border !bg-cw-orange-tint !text-cw-orange-text hover:!bg-cw-orange-tint", className)} {...rest} />;
  }
  return <Button variant={variant} size={size} className={className} {...rest} />;
}

export function PChip({
  color,
  bg,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { color: string; bg: string }) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", className)}
      style={{ color, background: bg }}
      {...rest}
    >
      {children}
    </span>
  );
}

export function PMono({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={clsx("font-mono", className)} {...rest} />;
}

/** Table header cell label, console style. */
export function PTh({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("text-[11px] font-bold tracking-[0.06em] text-cw-text-muted", className)}
      {...rest}
    />
  );
}

/** Empty state (§2.5): the kit's look, with any icon node. */
export function PEmpty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      {icon && (
        <div aria-hidden className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-cw-border bg-cw-bg-sunken text-cw-text-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {icon}
        </div>
      )}
      <div className="mt-1 text-[15px] font-bold text-cw-text">{title}</div>
      {children && <div className="max-w-[340px] text-[13px] leading-normal text-cw-text-muted">{children}</div>}
    </div>
  );
}
